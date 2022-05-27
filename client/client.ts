import {
  AuthenticationResult,
  ConnectPacket,
  debug,
  Deferred,
  Dup,
  PacketType,
  Payload,
  PublishPacket,
  SubscribePacket,
  Topic,
} from "./deps.ts";

import { MemoryStore } from "./memoryStore.ts";
import { Context } from "./context.ts";

function generateClientId(prefix: string): string {
  return `${prefix}-${Math.random().toString().slice(-10)}`;
}

type ConnectOptions = Omit<
  ConnectPacket,
  "type" | "protocolName" | "protocolLevel"
>;
export type ConnectParameters = {
  url?: URL;
  caCerts?: string[];
  numberOfRetries?: number;
  options?: ConnectOptions;
};

export type PublishParameters = Omit<PublishPacket, "type" | "id">;
export type SubscribeParameters = Omit<SubscribePacket, "type" | "id">;

function backOffSleep(random: boolean, attempt: number): Promise<void> {
  // based on https://dthain.blogspot.com/2009/02/exponential-backoff-in-distributed.html
  const factor = 1.5;
  const min = 1000;
  const max = 5000;
  const randomness = 1 + (random ? Math.random() : 0);
  const delay = Math.floor(
    Math.min(randomness * min * Math.pow(factor, attempt), max),
  );
  debug.log({ delay });
  return new Promise((resolve) => setTimeout(resolve, delay));
}

export const DEFAULT_URL = "mqtt://localhost:1883/";
const DEFAULT_KEEPALIVE = 60; // 60 seconds
const DEFAULT_RETRIES = 3; // on first connect
const CLIENTID_PREFIX = "opifex"; // on first connect

export class Client {
  protected clientIdPrefix = CLIENTID_PREFIX;
  protected numberOfRetries = DEFAULT_RETRIES;
  protected url = new URL(DEFAULT_URL);
  protected keepAlive = DEFAULT_KEEPALIVE;
  protected autoReconnect = true;
  private caCerts?: string[];
  private clientId: string;
  private ctx = new Context(new MemoryStore());
  private connectPacket?: ConnectPacket;

  constructor() {
    this.clientId = generateClientId(this.clientIdPrefix);
    this.numberOfRetries = DEFAULT_RETRIES;
  }

  private async connectMQTT(hostname: string, port = 1883) {
    debug.log({ hostname, port });
    return await Deno.connect({ hostname, port });
  }

  private async connectMQTTS(
    hostname: string,
    port = 8883,
    caCerts?: string[],
  ) {
    debug.log({ hostname, port, caCerts });
    return await Deno.connectTls({ hostname, port, caCerts });
  }

  protected async createConn(
    protocol: string,
    hostname: string,
    port?: number,
    caCerts?: string[],
  ): Promise<Deno.Conn> {
    // if you need to support alternative connection types just
    // overload this method in your subclass
    if (protocol === "mqtts:") {
      return this.connectMQTTS(hostname, port, caCerts);
    }
    if (protocol === "mqtt:") {
      return this.connectMQTT(hostname, port);
    }
    throw `Unsupported protocol: ${protocol}`;
  }

  private async doConnect(): Promise<void> {
    if (!this.connectPacket) {
      return;
    }
    let isReconnect = false;
    let attempt = 1;
    let lastMessage = "";
    let tryConnect = true;
    while (tryConnect) {
      debug.log(`${isReconnect ? "re" : ""}connecting`);
      try {
        const conn = await this.createConn(
          this.url.protocol,
          this.url.hostname,
          Number(this.url.port) || undefined,
          this.caCerts,
        );
        // if we get this far we have a connection
        tryConnect =
          await this.ctx.handleConnection(conn, this.connectPacket) &&
          this.autoReconnect;
        debug.log({ tryConnect });
        isReconnect = true;
        this.connectPacket.clean = false;
        this.ctx.close();
      } catch (err) {
        lastMessage = `Connection failed: ${err.message}`;
        debug.log(lastMessage);
        if (!isReconnect && attempt > this.numberOfRetries) {
          tryConnect = false;
        } else {
          await backOffSleep(true, attempt++);
        }
      }
    }

    if (isReconnect === false) {
      this.ctx.unresolvedConnect?.reject(Error(lastMessage));
      this.ctx.onerror(Error(lastMessage));
    }
  }

  connect(
    params: ConnectParameters = {},
  ): Promise<AuthenticationResult> {
    this.url = params?.url || this.url;
    this.numberOfRetries = params.numberOfRetries || this.numberOfRetries;
    this.caCerts = params?.caCerts;
    const options = Object.assign({
      keepAlive: this.keepAlive,
      clientId: this.clientId,
    }, params?.options);
    this.connectPacket = {
      type: PacketType.connect,
      ...options,
    };
    const deferred = new Deferred<AuthenticationResult>();
    this.ctx.unresolvedConnect = deferred;
    this.doConnect();
    return deferred.promise;
  }

  async disconnect(): Promise<void> {
    await this.ctx.disconnect();
  }

  async publish(params: PublishParameters): Promise<void> {
    const packet: PublishPacket = {
      type: PacketType.publish,
      ...params,
    };
    await this.ctx.send(packet);
  }

  async subscribe(params: SubscribeParameters): Promise<void> {
    const packet: SubscribePacket = {
      type: PacketType.subscribe,
      id: this.ctx.store.nextId(),
      ...params,
    };
    await this.ctx.send(packet);
  }

  onopen(callback: () => void) {
    this.ctx.onopen = async () => callback;
  }

  onconnect(callback: () => void) {
    this.ctx.onconnect = async () => callback;
  }

  onmessage(callback: (topic:Topic, payload:Payload, dup:Dup) => void) {
    this.ctx.onmessage = async (topic:Topic, payload:Payload, dup?:Dup) =>
      callback(topic, payload, dup || false);
  }

  onclose(callback: () => void) {
    this.ctx.onclose = async () => callback;
  }

  onerror(callback: (err: Error) => void) {
    this.ctx.onerror = async (err) => callback(err);
  }
}
