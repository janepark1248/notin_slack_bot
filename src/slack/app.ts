import { App } from "@slack/bolt";
import { config } from "../config";

export const app = new App({
  token: config.slack.botToken,
  appToken: config.slack.appToken,
  socketMode: true,
});
