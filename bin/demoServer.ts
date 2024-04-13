import {
  AuthenticationResult,
  type Context,
  type Topic,
} from "../server/mod.ts";
import { logger, LogLevel } from "../utils/mod.ts";
import { getArgs, parseArgs } from "../utils/mod.ts";
import { TcpServer } from "../deno/server.ts";

const utf8Decoder = new TextDecoder();
const userTable = new Map();
userTable.set("IoTester_1", "strong_password");
userTable.set("IoTester_2", "strong_password");
// const strictUsername = new RegExp(/^[a-zA-Z0-9]{0,23}$/);

function isAuthenticated(
  _ctx: Context,
  clientId: string,
  username: string,
  password: Uint8Array,
): AuthenticationResult {
  const pwd = utf8Decoder.decode(password);
  logger.info(
    `Verifying authentication of client '${clientId}' with username '${username}' and password '${pwd}'`,
  );

  return AuthenticationResult.ok;
  // if (!userTable.has(username)) {
  //   if (!strictUsername.test(username)) {
  //     return AuthenticationResult.badUsernameOrPassword;
  //   }
  // }

  // const pass = userTable.get(username);
  // if (pwd === pass) {
  //   return AuthenticationResult.ok;
  // }
  // return AuthenticationResult.badUsernameOrPassword;
}

function isAuthorizedToPublish(ctx: Context, topic: Topic): boolean {
  logger.debug(
    `Checking authorization of client '${ctx.store?.clientId}' to publish on topic '${topic}'`,
  );
  return true;
}
function isAuthorizedToSubscribe(ctx: Context, topic: Topic): boolean {
  logger.debug(
    `Checking authorization of client '${ctx.store?.clientId}' to subscribe to topic '${topic}'`,
  );
  return true;
}

/** start the server **/
const { _: [portNum] } = parseArgs(getArgs());
const port = Number(portNum ?? 1883);
const hostname = "::";
logger.level(LogLevel.info);
const tcpServer = new TcpServer({ port, hostname }, {
  handlers: {
    isAuthenticated,
    isAuthorizedToPublish,
    isAuthorizedToSubscribe,
  },
});
tcpServer.start();
logger.info(`Server started on port ${tcpServer.port}`);
