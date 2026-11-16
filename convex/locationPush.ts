import { v } from 'convex/values';

import { internal } from './_generated/api';
import { internalAction, internalQuery } from './_generated/server';
import { fresh, inCity, LOCATION_TTL, locationFor, nearby, settingsFor, visibleLocation } from './lib/friendLocations';

const payloadValidator = v.union(v.null(), v.object({
  tokens: v.array(v.object({ _id: v.id('locationPushTokens'), token: v.string() })),
}));

export const payload = internalQuery({
  args: { alertId: v.id('locationAlerts'), eventTime: v.number(), now: v.number() }, returns: payloadValidator,
  handler: async (ctx, { alertId, eventTime, now }) => {
    const alert = await ctx.db.get('locationAlerts', alertId);
    if (!alert || alert.eventTime !== eventTime || alert.read || now - eventTime > LOCATION_TTL) return null;
    const settings = await settingsFor(ctx, alert.userId);
    const location = await visibleLocation(ctx, alert.actorId, alert.userId, now);
    if (!settings || !location) return null;
    if (alert.kind === 'nearby') {
      const own = settings.enabled ? await locationFor(ctx, alert.userId) : null;
      if (!settings.nearbyAlerts || !own || !fresh(own, now) || !nearby(own, location)) return null;
    } else {
      if (!settings.cityAlerts || !alert.destinationId || settings.visitingDestinationId !== alert.destinationId) return null;
      const city = await ctx.db.get('destinations', alert.destinationId);
      if (!city || !inCity(location, city)) return null;
    }
    const tokens = await ctx.db.query('locationPushTokens').withIndex('by_userId', q => q.eq('userId', alert.userId)).take(10);
    return { tokens: tokens.map(({ _id, token }) => ({ _id, token })) };
  },
});

export const send = internalAction({
  args: { alertId: v.id('locationAlerts'), eventTime: v.number(), attempt: v.number() }, returns: v.null(),
  handler: async (ctx, args) => {
    const payload = await ctx.runQuery(internal.locationPush.payload, { alertId: args.alertId, eventTime: args.eventTime, now: Date.now() });
    if (!payload?.tokens.length) return null;
    try {
      const response = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        // Keep names and coordinates off the lock screen. The app rechecks sharing on open.
        body: JSON.stringify(payload.tokens.map(({ token }) => ({ to: token, title: 'Find my friends',
          body: 'A friend is nearby or in your visiting city. Open Travi to see who.',
          data: { url: '/friends' }, channelId: 'friend-locations', sound: 'default' }))),
      });
      if (!response.ok) throw new Error(`Push service returned ${response.status}`);
      const body = await response.json() as { data?: { status: string; id?: string; details?: { error?: string } }[]; errors?: unknown[] };
      if (body.errors?.length || !Array.isArray(body.data)) throw new Error('Push service did not accept the request');
      const tickets = [];
      for (let i = 0; i < body.data.length; i++) {
        const ticket = body.data[i];
        const token = payload.tokens[i];
        if (!token) continue;
        if (ticket.details?.error === 'DeviceNotRegistered') {
          await ctx.runMutation(internal.friendLocations.deletePushToken, { tokenId: token._id });
        } else if (ticket.status === 'ok' && ticket.id) {
          tickets.push({ receiptId: ticket.id, tokenId: token._id });
        } else if (ticket.status === 'error') {
          console.error('Friend location push rejected:', ticket.details?.error ?? 'unknown');
        }
      }
      if (tickets.length) await ctx.scheduler.runAfter(15 * 60 * 1000, internal.locationPush.receipts, { tickets });
    } catch (error) {
      if (args.attempt < 2) await ctx.scheduler.runAfter(30000 * 2 ** args.attempt, internal.locationPush.send, { ...args, attempt: args.attempt + 1 });
      else console.error('Friend location push delivery failed:', error instanceof Error ? error.message : 'unknown');
    }
    return null;
  },
});

export const receipts = internalAction({
  args: { tickets: v.array(v.object({ receiptId: v.string(), tokenId: v.id('locationPushTokens') })) }, returns: v.null(),
  handler: async (ctx, { tickets }) => {
    const response = await fetch('https://exp.host/--/api/v2/push/getReceipts', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: tickets.map(t => t.receiptId) }),
    });
    if (!response.ok) { console.error('Could not check friend notification receipts'); return null; }
    const body = await response.json() as { data?: Record<string, { status: string; details?: { error?: string } }> };
    for (const ticket of tickets) {
      const receipt = body.data?.[ticket.receiptId];
      if (receipt?.details?.error === 'DeviceNotRegistered') await ctx.runMutation(internal.friendLocations.deletePushToken, { tokenId: ticket.tokenId });
      else if (receipt?.status === 'error') console.error('Friend push receipt error:', receipt.details?.error ?? 'unknown');
    }
    return null;
  },
});
