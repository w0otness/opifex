#!/usr/bin/env -S node --experimental-strip-types
import { DEFAULT_URL } from "../client/mod.ts";
import { logger, LogLevel } from "../utils/mod.ts";
import { getArgs, parseArgs } from "../utils/mod.ts";
import { getCaCerts, TcpClient } from "../node/client.ts";

const client = new TcpClient();
const encoder = new TextEncoder();
const decoder = new TextDecoder();
logger.level(LogLevel.info);

const MQTTHelp = `MQTT command line interface, available commands are:

    * publish     publish a message to the broker
    * subscribe   subscribe for updates from the broker

Run 'mqtt [command] --help' to know more about the commands.`;

const ConnectHelp = `
  -u/--url        the URL to connect to: default is ${DEFAULT_URL}
  -i/--clientId   the clientId to connect to the server
  -U/--username   the username to connect to the server
  -P/--password   the password to connect to the server
  -c/--certFile   the path to a certFile
  -n/--noClean    try to resume a previous session
  -h/--help       this text
  `;

const connectOpts = {
  string: ["url", "username", "password", "certFile", "clientId"],
  alias: {
    u: "url",
    U: "username",
    P: "password",
    c: "certFile",
    i: "clientId",
    n: "noClean",
    h: "help",
  },
  boolean: ["noClean", "help"],
  default: {
    noClean: false,
    clientId: `Opifex-${crypto.randomUUID()}`,
  },
};

const SubscribeHelp = `Usage: mqtt subscribe <options>

Where options are:
  -t/--topic      the topic to use
  -q/--qos        the QoS (0/1/2) to use, default is 0
${ConnectHelp}
Example: mqtt subscribe -t hello`;

const subscribeOpts = {
  string: ["topic"],
  alias: {
    t: "topic",
    q: "qos",
  },
  default: {
    qos: 0,
    topic: "",
  },
};

function parseQos(qosArg: string | number) {
  const qos = Number(qosArg);
  switch (qos) {
    case 0:
      return 0;
    case 1:
      return 1;
    case 2:
      return 2;
    default:
      break;
  }
  console.log("QoS must be between 0 and 2");
  return 0;
}

async function subscribe() {
  const connectArgs = parseArgs(getArgs(), connectOpts);
  const caCerts = await getCaCerts(connectArgs.certFile);
  const subscribeArgs = parseArgs(getArgs(), subscribeOpts);
  if (connectArgs.help) {
    console.log(SubscribeHelp);
    return;
  }
  if (subscribeArgs.topic === undefined) {
    console.log("Missing `topic`");
    return;
  }
  try {
    await client.connect({
      url: connectArgs.url,
      caCerts,
      options: {
        username: connectArgs.username,
        password: encoder.encode(connectArgs.password),
        clientId: connectArgs.clientId,
        clean: !connectArgs.noClean,
        keepAlive: 60,
      },
    });
    logger.debug("Connected !");

    client.subscribe({
      subscriptions: [
        {
          topicFilter: subscribeArgs.topic,
          qos: parseQos(subscribeArgs.qos),
        },
      ],
    });
    logger.debug("Subscribed!");

    for await (const message of client.messages()) {
      console.log(decoder.decode(message.payload));
    }
  } catch (err) {
    if (err instanceof Error) {
      // @ts-ignore the type spec of err is missing err.code
      logger.info(`Error: ${err.message || err.code}`);
    }
  }
}

const PublishHelp = `Usage: mqtt publish <options>

Where options are:
  -t/--topic      the topic to use
  -m/--message    the message to send
  -q/--qos        the QoS (0/1/2) to use, default is 0
  -r/--retain     if the message should be retained, default is false
${ConnectHelp}
Example: mqtt publish -t hello -m world`;

const publishOpts = {
  string: ["topic", "message"],
  boolean: ["retain"],
  alias: {
    t: "topic",
    m: "message",
    q: "qos",
    r: "retain",
  },
  default: {
    qos: 0,
    dup: false,
    retain: false,
    topic: undefined,
    message: "",
  },
};

async function publish() {
  const connectArgs = parseArgs(getArgs(), connectOpts);
  const caCerts = await getCaCerts(connectArgs.certFile);
  const publishArgs = parseArgs(getArgs(), publishOpts);
  if (connectArgs.help) {
    console.log(PublishHelp);
    return;
  }
  if (publishArgs.topic === undefined) {
    console.log("Missing `topic`");
    return;
  }
  try {
    await client.connect({
      url: connectArgs.url,
      caCerts,
      options: {
        username: connectArgs.username,
        password: encoder.encode(connectArgs.password),
        clientId: connectArgs.clientId,
        clean: !connectArgs.noClean,
      },
    });
    logger.debug("Connected !");
    await client.publish({
      topic: publishArgs.topic,
      payload: encoder.encode(publishArgs.message),
      retain: publishArgs.retain,
      qos: parseQos(publishArgs.qos),
    });
    logger.debug("Published!");
    client.disconnect();
    logger.debug("Disconnected !");
  } catch (err) {
    if (err instanceof Error) {
      // @ts-ignore the type spec of err is missing err.code
      logger.info(`Error: ${err.message || err.code}`);
    }
  }
}

function processArgs() {
  const { _: [cmd] } = parseArgs(getArgs());
  switch (cmd) {
    case "publish":
      publish();
      break;
    case "subscribe":
      subscribe();
      break;
    default:
      console.log(MQTTHelp);
      break;
  }
}

processArgs();
