import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

describe('telephony inbound flow', () => {
  it('does not create order before explicit confirmation and creates on yes', async () => {
    const { app } = createApp();
    const callId = 'CA-test-1';

    await request(app)
      .post('/api/telephony/inbound')
      .send({ call_id: callId, store_id: 'store-1', from: '+15551112222', utterance: 'hello' })
      .expect(200);

    await request(app)
      .post('/api/telephony/inbound')
      .send({ call_id: callId, store_id: 'store-1', from: '+15551112222', utterance: 'pickup order' })
      .expect(200);

    await request(app)
      .post('/api/telephony/inbound')
      .send({ call_id: callId, store_id: 'store-1', from: '+15551112222', utterance: 'Alex' })
      .expect(200);

    await request(app)
      .post('/api/telephony/inbound')
      .send({ call_id: callId, store_id: 'store-1', from: '+15551112222', utterance: 'Chicken Burrito' })
      .expect(200);

    const readback = await request(app)
      .post('/api/telephony/inbound')
      .send({ call_id: callId, store_id: 'store-1', from: '+15551112222', utterance: 'done' })
      .expect(200);
    expect(String(readback.body.response)).toContain('Alex');
    expect(String(readback.body.response)).toContain('+15551112222');

    const beforeConfirm = await request(app)
      .get('/api/orders')
      .query({ store_id: 'store-1' })
      .expect(200);

    expect(beforeConfirm.body.orders).toHaveLength(0);

    const confirmed = await request(app)
      .post('/api/telephony/inbound')
      .send({ call_id: callId, store_id: 'store-1', from: '+15551112222', utterance: 'yes' })
      .expect(200);

    expect(confirmed.body.created_order_id).toBeDefined();

    const afterConfirm = await request(app)
      .get('/api/orders')
      .query({ store_id: 'store-1' })
      .expect(200);

    expect(afterConfirm.body.orders).toHaveLength(1);
  });

  it('handles duplicate inbound confirm idempotently', async () => {
    const { app } = createApp();
    const callId = 'CA-test-dup';
    const inputs = ['hello', 'pickup order', 'Taylor', 'Veggie Bowl', 'done', 'yes', 'yes'];

    for (const utterance of inputs) {
      await request(app)
        .post('/api/telephony/inbound')
        .send({ call_id: callId, store_id: 'store-1', from: '+15553334444', utterance })
        .expect(200);
    }

    const list = await request(app).get('/api/orders').query({ store_id: 'store-1' }).expect(200);
    expect(list.body.orders).toHaveLength(1);
  });

  it('transfers to staff after two failed clarification attempts and emits handoff event', async () => {
    const { app } = createApp();
    const callId = 'CA-clarify-2-attempts';

    const inputs = ['hello', 'pickup order', 'Jordan', 'b', 'nope', 'still wrong'];
    let latest: { body: { handoff?: boolean } } | undefined;
    for (const utterance of inputs) {
      latest = await request(app)
        .post('/api/telephony/inbound')
        .send({ call_id: callId, store_id: 'store-1', from: '+15556667777', utterance })
        .expect(200);
    }

    expect(latest?.body.handoff).toBe(true);

    const events = await request(app).get('/api/stores/store-1/events').query({ since_id: 0 }).expect(200);
    expect(events.body.events.some((event: { eventType: string }) => event.eventType === 'CallHandoffRequested')).toBe(true);
  });

  it('mentions busy prep-time expectations when store mode is BUSY', async () => {
    const { app } = createApp();
    const callId = 'CA-busy-1';

    await request(app).patch('/api/stores/store-1/mode').send({ mode: 'BUSY' }).expect(200);
    await request(app)
      .post('/api/telephony/inbound')
      .send({ call_id: callId, store_id: 'store-1', from: '+15557778888', utterance: 'hello' })
      .expect(200);
    const busy = await request(app)
      .post('/api/telephony/inbound')
      .send({ call_id: callId, store_id: 'store-1', from: '+15557778888', utterance: 'pickup order' })
      .expect(200);

    expect(String(busy.body.response).toLowerCase()).toContain('busy mode');
  });
});
