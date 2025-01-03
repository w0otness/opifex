import { PacketType, } from "../deps.js";
const SubscriptionFailure = 0x80;
function authorizedToSubscribe(ctx, topicFilter) {
    if (ctx.handlers.isAuthorizedToSubscribe) {
        return ctx.handlers.isAuthorizedToSubscribe(ctx, topicFilter);
    }
    return true;
}
export async function handleSubscribe(ctx, packet) {
    //  The order of return codes in the SUBACK Packet MUST match the order of
    //  Topic Filters in the SUBSCRIBE Packet [MQTT-3.9.3-1].
    const validSubscriptions = [];
    const returnCodes = packet.subscriptions.map((sub) => {
        if (ctx.store) {
            if (!authorizedToSubscribe(ctx, sub.topicFilter)) {
                return SubscriptionFailure;
            }
            ctx.persistence.subscribe(ctx.store, sub.topicFilter, sub.qos);
            validSubscriptions.push(sub);
            return sub.qos;
        }
        return SubscriptionFailure; // failure
    });
    await ctx.send({
        type: PacketType.suback,
        id: packet.id,
        returnCodes: returnCodes,
    });
    // send any retained messages that match these subscriptions
    if (ctx.store) {
        ctx.persistence.handleRetained(ctx.store.clientId);
    }
}
