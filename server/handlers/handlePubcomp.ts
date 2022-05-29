import { Context } from "../context.ts";
import { PubcompPacket } from "../deps.ts";

// The PUBCOMP Packet is the response to a PUBREL Packet. 
// It is the fourth and final packet of the QoS 2 protocol exchange.

export async function handlePubcomp(
  ctx: Context,
  packet: PubcompPacket,
): Promise<void> {
  const id = packet.id;
  if (ctx.client?.pendingAckOutgoing.has(id)) {
    ctx.client.pendingAckOutgoing.delete(id);
  }
}
