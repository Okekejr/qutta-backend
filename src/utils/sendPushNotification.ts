import { Expo } from "expo-server-sdk";

const expo = new Expo();

export async function sendPushNotification(
  token: string,
  title: string,
  body: string
) {
  if (!Expo.isExpoPushToken(token)) {
    console.error(`Push token ${token} is not a valid Expo push token`);
    return;
  }

  const message = {
    to: token,
    sound: "default",
    title,
    body,
    data: { withSome: "data" },
  };

  try {
    const receipt = await expo.sendPushNotificationsAsync([message]);
    console.log("Push notification sent:", receipt);
  } catch (error) {
    console.error("Error sending push notification:", error);
  }
}
