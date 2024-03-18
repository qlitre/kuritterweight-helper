import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigw from 'aws-cdk-lib/aws-apigateway';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as iam from 'aws-cdk-lib/aws-iam';

export class KuritterweightStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Lambda関数用のIAMロールを作成
    const lambdaRole = new iam.Role(this, 'MyLambdaExecutionRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
    });

    // DynamoDBテーブルへのアクセス権限を持つカスタムポリシーを作成
    const policy = new iam.Policy(this, 'MyLambdaPolicy', {
      statements: [
        new iam.PolicyStatement({
          actions: ['dynamodb:GetItem', 'dynamodb:PutItem', 'dynamodb:Query'],
          resources: [`arn:aws:dynamodb:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:table/KuritterWeight`],
        }),
      ],
    });

    // ロールにポリシーをアタッチ
    lambdaRole.attachInlinePolicy(policy);

    // Lambda基本実行ロールをアタッチ
    lambdaRole.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'));

    // Lambda関数の設定（名前を変更）
    const fn = new NodejsFunction(this, 'kuritterweight', { // ここで関数名を設定
      entry: 'lambda/index.ts',
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      role: lambdaRole,
      functionName: 'kuritterweight', // 関数の名前を設定
    });

    // API Gatewayの設定
    new apigw.LambdaRestApi(this, 'KuritterWeightApi', {
      handler: fn,
    });
  }
}
