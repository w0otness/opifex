import { assertEquals, DummyQueueConn } from "../../dev_utils/mod.ts";
import { handlers } from "./test-handlers.ts";
import {
  AnyPacket,
  AuthenticationResult,
  PacketType,
} from "../../mqttPacket/mod.ts";
import { MqttServer } from "../mod.ts";
import { MqttConn } from "../deps.ts";
import { AsyncQueue, nextTick } from "../../utils/mod.ts";

const txtEncoder = new TextEncoder();
// logger.level(LogLevel.debug);

const connectPacket: AnyPacket = {
  type: PacketType.connect,
  protocolName: "MQTT",
  protocolLevel: 4,
  clientId: "testClient",
  clean: true,
  keepAlive: 0,
  username: "IoTester_1",
  password: txtEncoder.encode("strong_password"),
  will: undefined,
};

const disconnectPacket: AnyPacket = {
  type: PacketType.disconnect,
};

const mqttServer = new MqttServer({ handlers });

function startServer(): {
  reader: AsyncIterableIterator<AnyPacket>;
  mqttConn: MqttConn;
} {
  const reader = new AsyncQueue<Uint8Array>();
  const writer = new AsyncQueue<Uint8Array>();

  const outputConn = new DummyQueueConn(writer, reader);
  const mqttConn = new MqttConn({ conn: outputConn });
  const inputConn = new DummyQueueConn(reader, writer, () => {
    mqttConn.close();
  });
  mqttServer.serve(inputConn);
  return { reader: mqttConn[Symbol.asyncIterator](), mqttConn };
}

Deno.test("Authentication with valid username and password works", async () => {
  const { reader, mqttConn } = startServer();
  mqttConn.send(connectPacket);
  const { value: connack } = await reader.next();
  assertEquals(connack.type, PacketType.connack, "Expect Connack packet");
  if (connack.type === PacketType.connack) {
    assertEquals(connack.returnCode, AuthenticationResult.ok, "Expected OK");
  }
  mqttConn.send(disconnectPacket);
  await nextTick();
  assertEquals(mqttConn.isClosed, true, "Expected connection to be closed");
});

Deno.test("Authentication with invalid username fails", async () => {
  const newPacket = Object.assign({}, connectPacket);
  newPacket.username = "wrong";
  const { reader, mqttConn } = startServer();
  mqttConn.send(newPacket);
  const { value: connack } = await reader.next();
  assertEquals(connack.type, PacketType.connack, "Expected Connack packet");
  if (connack.type === PacketType.connack) {
    assertEquals(
      connack.returnCode,
      AuthenticationResult.badUsernameOrPassword,
      "Expected badUsernameOrPassword",
    );
  }
  await nextTick();
  assertEquals(mqttConn.isClosed, true, "Expected connection to be closed");
});

Deno.test("Authentication with invalid password fails", async () => {
  const newPacket = Object.assign({}, connectPacket);
  newPacket.password = undefined;
  const { reader, mqttConn } = startServer();
  mqttConn.send(newPacket);
  const { value: connack } = await reader.next();
  assertEquals(connack.type, PacketType.connack, "Expected Connack packet");
  if (connack.type === PacketType.connack) {
    assertEquals(
      connack.returnCode,
      AuthenticationResult.badUsernameOrPassword,
      "Expected badUsernameOrPassword",
    );
  }
  await nextTick();
  assertEquals(mqttConn.isClosed, true, "Expected connection to be closed");
});
