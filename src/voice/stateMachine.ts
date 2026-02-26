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

function buildOrderReadback(session: CallSession): string {
  const itemSummary = session.draftItems
    .map((item) => `${item.qty} ${item.qty > 1 ? 'x' : ''} ${item.itemName}`.trim())
    .join(', ');
  return `for ${session.customerName}, phone ${session.callerPhone}, items: ${itemSummary}`;
}

async function transferToStaff(session: CallSession, tools: VoiceTools, reason: string, response: string): Promise<StepResult> {
  await tools.execute('handoff', {
    storeId: session.storeId,
    callId: session.callId,
    reason,
    callerPhone: session.callerPhone,
    customerName: session.customerName,
    draftItems: session.draftItems
  });
  session.state = 'HANDOFF';
  session.handoff = true;
  return { session, response };
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
    return transferToStaff(session, tools, 'caller_requested_staff', 'I will transfer you to staff now.');
  }

  if (session.state === 'INTENT') {
    const modeResult = await tools.execute('get_store_mode', { storeId: session.storeId });
    if (modeResult.type === 'mode' && modeResult.mode === 'CLOSED') {
      return transferToStaff(
        session,
        tools,
        'store_closed',
        'The store is currently closed. I can transfer you to staff for help.'
      );
    }

    if (lc.includes('delivery')) {
      return transferToStaff(session, tools, 'delivery_not_supported', 'Delivery is not supported right now. I can transfer you to staff.');
    }

    if (lc.includes('hour') || lc.includes('info')) {
      return { session, response: 'The store is open daily from 11 AM to 9 PM. Do you want to place a pickup order?' };
    }

    session.state = 'ORDER_NAME';
    if (modeResult.type === 'mode' && modeResult.mode === 'BUSY') {
      const busyMins = modeResult.defaultPrepMins + 10;
      return { session, response: `We are in busy mode. Pickup times are currently about ${busyMins} minutes. Please tell me your name for the pickup order.` };
    }

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
      return {
        session,
        response: `Please confirm your pickup order ${buildOrderReadback(session)}. Say yes to place it.`
      };
    }

    const validation = await tools.execute('validate_item', { storeId: session.storeId, query: text });
    if (validation.type !== 'matches' || validation.matches.length === 0) {
      return { session, response: 'I could not find that menu item. Please say the item name again.' };
    }

    if (validation.matches.length > 1) {
      session.pendingClarification = validation.matches.map((item) => item.name);
      session.clarificationAttempts = 0;
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
    session.draftItems.push({ itemId: firstMatch.id, itemName: firstMatch.name, qty: extractQuantity(lc) });
    return { session, response: 'Added. You can add another item or say done.' };
  }

  if (session.state === 'ORDER_CLARIFY') {
    const options = session.pendingClarification ?? [];
    const selected = options.find((option) => option.toLowerCase().includes(lc) || lc.includes(option.toLowerCase()));
    if (!selected) {
      const failedAttempts = (session.clarificationAttempts ?? 0) + 1;
      session.clarificationAttempts = failedAttempts;
      if (failedAttempts >= 2) {
        return transferToStaff(
          session,
          tools,
          'clarification_failed',
          'I still cannot resolve that item after two attempts. I will transfer you to staff.'
        );
      }
      return { session, response: `Please choose one of: ${options.join(', ')}.` };
    }

    const validated = await tools.execute('validate_item', { storeId: session.storeId, query: selected });
    const matched = validated.type === 'matches' ? validated.matches[0] : undefined;
    if (!matched) {
      const failedAttempts = (session.clarificationAttempts ?? 0) + 1;
      session.clarificationAttempts = failedAttempts;
      if (failedAttempts >= 2) {
        return transferToStaff(
          session,
          tools,
          'clarification_failed',
          'I still cannot resolve that item after two attempts. I will transfer you to staff.'
        );
      }
      return { session, response: `Please choose one of: ${options.join(', ')}.` };
    }

    session.draftItems.push({ itemId: matched.id, itemName: matched.name, qty: extractQuantity(lc) });
    delete session.pendingClarification;
    delete session.clarificationAttempts;
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
      items: session.draftItems.map((item) => ({ itemId: item.itemId, qty: item.qty }))
    });

    if (created.type === 'order_blocked') {
      return transferToStaff(session, tools, created.reason, 'Automated intake is currently disabled. I will transfer you to staff.');
    }

    if (created.type !== 'order_created') {
      return transferToStaff(session, tools, 'order_create_failed', 'I could not place the order. I will transfer you to staff.');
    }

    session.createdOrderId = created.orderId;
    session.state = 'COMPLETED';
    return { session, response: `Your order is confirmed. Order number ${created.orderNumber}. Thank you.` };
  }

  return { session, response: 'Please hold while I transfer you to staff.' };
}
