import { Hono } from 'hono'
import { handle } from 'hono/aws-lambda'
import { DynamoDB } from 'aws-sdk';
import { TwitterApi } from 'twitter-api-v2';

import {
    MessageAPIResponseBase,
    TextMessage,
    WebhookEvent,
} from "@line/bot-sdk";


const app = new Hono()
const dynamoDb = new DynamoDB.DocumentClient();

// Twitter APIのクライアント設定
const twitterClient = new TwitterApi({
    appKey: process.env.TWITTER_API_KEY || '',
    appSecret: process.env.TWITTER_API_KEY_SECRET || '',
    accessToken: process.env.TWITTER_ACCESS_TOKEN || '',
    accessSecret: process.env.TWITTER_ACCESS_TOKEN_SECRET || '',
});

// 読み書きが可能なクライアントを作成
const rwClient = twitterClient.readWrite;

app.get('/', (c) => c.text('Hello Hono!'))

app.post("/api/webhook", async (c) => {
    if (!c.env) {
        console.error('Environment variables are not available');
        return c.json({ error: 'Environment configuration error' });
    }
    if (!process.env.CHANNEL_ACCESS_TOKEN) {
        console.error('CHANNEL_ACCESS_TOKEN is not defined');
        return c.json({ error: 'Invalid configuration' });
    }
    const data = await c.req.json();
    const events: WebhookEvent[] = (data as any).events;
    const accessToken: string = process.env.CHANNEL_ACCESS_TOKEN;

    await Promise.all(
        events.map(async (event: WebhookEvent) => {
            try {
                await textEventHandler(event, accessToken);
                return
            } catch (err: unknown) {
                if (err instanceof Error) {
                    console.error(err);
                }
                return c.json({
                    status: "error",
                });
            }
        })
    );
    return c.json({ message: "ok" });
});

const textEventHandler = async (
    event: WebhookEvent,
    accessToken: string
): Promise<MessageAPIResponseBase | undefined> => {
    console.log(event);
    if (event.type !== "message" || event.message.type !== "text") {
        return;
    }

    const userId = event.source.userId;
    const curWeight = parseFloat(event.message.text); // 体重データのパース
    let message = "";
    if (!isNaN(curWeight) && userId) {
        const recentWeight = await getLatestWeightFromDynamoDB(userId); // 最新の体重データを取得
        message = buildTweetMessage(recentWeight, curWeight); // ツイートメッセージの作成
        await postTweet(`${message}`); // ツイートの投稿
        await saveWeightToDynamoDB(userId, curWeight); // DynamoDBへの保存
    } else {
        message = "体重データが不正です";
    }

    const { replyToken } = event;
    const response: TextMessage = {
        type: "text",
        text: message,
    };
    await fetch("https://api.line.me/v2/bot/message/reply", {
        body: JSON.stringify({
            replyToken: replyToken,
            messages: [response],
        }),
        method: "POST",
        headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
        },
    });
    return
};

const buildTweetMessage = (recentWeight: number, curWeight: number) => {
    const diff = curWeight - recentWeight;
    let message = `${curWeight}kg`;
    // 小数点第一位まで表示
    const diffString = diff.toFixed(1);
    if (diff > 0) {
        message += `(+${diffString})`;
    } else if (diff < 0) {
        message += `(${diffString})`;
    } else {
        message += `(±0)`;
    }
    return `${message} #kuritterweight`
}


// DynamoDBから最新のweightを取得
const getLatestWeightFromDynamoDB = async (userId: string) => {
    const params = {
        TableName: 'KuritterWeight',
        KeyConditionExpression: 'UserId = :userId',
        ExpressionAttributeValues: {
            ':userId': userId,
        },
        ScanIndexForward: false,
        Limit: 1,
    };
    const data = await dynamoDb.query(params).promise();
    return data.Items?.[0]?.Weight;
};

const saveWeightToDynamoDB = async (userId: string, weight: number) => {
    const params = {
        TableName: 'KuritterWeight',
        Item: {
            UserId: userId,
            Weight: weight,
            Timestamp: new Date().toISOString(),
        },
    };

    await dynamoDb.put(params).promise();
};

// ツイートを投稿する関数
const postTweet = async (message: string): Promise<void> => {
    try {
        const response = await rwClient.v2.tweet(message);
        console.log('Tweeted:', response.data);
    } catch (error) {
        console.error(error);
    }
};

export const handler = handle(app)