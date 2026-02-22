import type { CallSession } from '../types.js';
import type { VoiceTools } from './tools.js';

interface StepResult {
  response: string;
  session: CallSession;
}

function extractQuantity(text: string): number {
  const match = text.match(/\b(\d{1,2})\b/);
  if (!match) return 1;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

export async function handleCallerUtterance(session: CallSession, utterance: string, tools: VoiceTools): Promise<StepResult> {
  const text = utterance.trim();
  const lc = text.toLowerCase();

  if (session.state === 'GREETING') {
    session.state = 'INTENT';
    return {
      session,
      response: 'Thanks for calling. I can help with pickup orders, store info, or transfer to staff. What do you need?'
    };
  }

  if (lc.includes('staff') || lc.includes('representative') || lc.includes('human')) {
    await tools.execute('handoff', { reason: 'caller_requested_staff' });
    session.state = 'HANDOFF';
    session.handoff = true;
    return { session, response: 'I will transfer you to staff now.' };
  }

  if (session.state === 'INTENT') {
    const modeResult = await tools.execute('get_store_mode', { storeId: session.storeId });
    if (modeResult.type === 'mode' && modeResult.mode === 'CLOSED') {
      session.state = 'HANDOFF';
      session.handoff = true;
      return { session, response: 'The store is currently closed. I can transfer you to staff for help.' };
    }

    if (lc.includes('delivery')) {
      session.state = 'HANDOFF';
      session.handoff = true;
      return { session, response: 'Delivery is not supported right now. I can transfer you to staff.' };
    }

    if (lc.includes('hour') || lc.includes('info')) {
      return { session, response: 'The store is open daily from 11 AM to 9 PM. Do you want to place a pickup order?' };
    }

    session.state = 'ORDER_NAME';
    return { session, response: 'Great. Please tell me your name for the pickup order.' };
  }

  if (session.state === 'ORDER_NAME') {
    if (text.length < 2) {
      return { session, response: 'I did not catch your name. Please repeat your name.' };
    }
    session.customerName = text;
    session.state = 'ORDER_ITEM';
    return { session, response: 'What item would you like to order?' };
  }

  if (session.state === 'ORDER_ITEM') {
    if (lc.includes('done') || lc.includes("that's all")) {
      if (session.draftItems.length === 0) {
        return { session, response: 'I still need at least one item. What would you like?' };
      }
      session.state = 'ORDER_CONFIRM';
      return { session, response: `Please confirm your order: ${session.draftItems.length} item(s). Say yes to place it.` };
    }

    const validation = await tools.execute('validate_item', { storeId: session.storeId, query: text });
    if (validation.type !== 'matches' || validation.matches.length === 0) {
      return { session, response: 'I could not find that menu item. Please say the item name again.' };
    }

    if (validation.matches.length > 1) {
      session.pendingClarification = validation.matches.map((item) => item.name);
      session.state = 'ORDER_CLARIFY';
      return {
        session,
        response: `I found multiple matches: ${session.pendingClarification.join(', ')}. Which one do you want?`
      };
    }

    const firstMatch = validation.matches[0];
    if (!firstMatch) {
      return { session, response: 'I could not find that menu item. Please say the item name again.' };
    }
    session.draftItems.push({ itemId: firstMatch.id, qty: extractQuantity(lc) });
    return { session, response: 'Added. You can add another item or say done.' };
  }

  if (session.state === 'ORDER_CLARIFY') {
    const options = session.pendingClarification ?? [];
    const selected = options.find((option) => option.toLowerCase().includes(lc) || lc.includes(option.toLowerCase()));
    if (!selected) {
      session.state = 'HANDOFF';
      session.handoff = true;
      return { session, response: 'I still cannot resolve that item. I will transfer you to staff.' };
    }
    const validated = await tools.execute('validate_item', { storeId: session.storeId, query: selected });
    if (validated.type === 'matches' && validated.matches[0]) {
      session.draftItems.push({ itemId: validated.matches[0].id, qty: extractQuantity(lc) });
    }
    delete session.pendingClarification;
    session.state = 'ORDER_ITEM';
    return { session, response: 'Added. You can add another item or say done.' };
  }

  if (session.state === 'ORDER_CONFIRM') {
    if (!(lc === 'yes' || lc.includes('confirm'))) {
      session.state = 'CANCELED';
      return { session, response: 'No problem. Your order was not placed.' };
    }

    if (!session.customerName) {
      session.state = 'ORDER_NAME';
      return { session, response: 'I need your name before placing the order.' };
    }

    const created = await tools.execute('create_order', {
      storeId: session.storeId,
      callId: session.callId,
      customerName: session.customerName,
      customerPhone: session.callerPhone,
      items: session.draftItems
    });

    if (created.type !== 'order_created') {
      session.state = 'HANDOFF';
      session.handoff = true;
      return { session, response: 'I could not place the order. I will transfer you to staff.' };
    }

    session.createdOrderId = created.orderId;
    session.state = 'COMPLETED';
    return { session, response: `Your order is confirmed. Order number ${created.orderNumber}. Thank you.` };
  }

  return { session, response: 'Please hold while I transfer you to staff.' };
}
