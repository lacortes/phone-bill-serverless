import { DynamoDB } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocument } from "@aws-sdk/lib-dynamodb";
import express, { query } from 'express';
import serverless from 'serverless-http';

const app = express();

const STATEMENT_TABLE = process.env.STATEMENT_TABLE;
const dynamoDb = DynamoDBDocument.from(new DynamoDB());

app.use(express.json());

app.post("/statements", async (req, res) => {
  const statement = req.body;
  
  if (!statement) {
    res.status(400).json({ error: 'Invalid statement' });
    return;
  }

  try {
    await dynamoDb.put({
      TableName: STATEMENT_TABLE,
      Item: statement,
      ConditionExpression: "attribute_not_exists(#year) AND attribute_not_exists(#month)",
      ExpressionAttributeNames: { "#year": "year", "#month": "month" }
    });
  } catch (error) {
    console.log(JSON.stringify(error));

    if (error?.name ?? '' === 'ConditionalCheckFailedException') {
      res.status(422).json({ error: "Cannot create an already existent statement" });
      return;
    }
    res.status(500).json({ error: "Could not save statement." });
    return;
  }

  res.status(201).json({ message: "Successfully created." });
});

app.get('/statements', async (req, res) => {
  try {
    const queryData = await dynamoDb.scan({
      TableName: STATEMENT_TABLE, 
      ProjectionExpression: '#month, #year, #createDate',
      ExpressionAttributeNames: { "#year": "year", "#month": "month", "#createDate": 'createDateTime' },
      Limit: 20
    });

    res.status(200).json({
      statements: queryData.Items
    });
  } catch (err) {
    console.error(err);

    res.status(500).json({ error: "Server Error!" });
  }
});

app.get('/statements/:statementID', async (req, res) => {
  const { statementID } = req.params;

  const maxFields = 2;
  let [year, month] = statementID.split('-', maxFields).map(Number);
  if (isNaN(year) || isNaN(month)) {
    res.status(400).json({ error: "Invalid statement ID." });
    return;
  }

  if (year == 0 && month == 0) {
    
    try {
      const queryData = await dynamoDb.scan({
        TableName: STATEMENT_TABLE, 
        ProjectionExpression: '#month, #year',
        ExpressionAttributeNames: { "#year": "year", "#month": "month" }
      });

      if (queryData.Count <= 0) {
        res.status(404).json({ message: "No statement found." });
        return;
      }
      
      const length = queryData.Count;
      ({year, month} = queryData.Items[length - 1]);
    } catch(err) {
      console.error(err);
      res.status(500).json({ error: "Server Error" });
      return;
    }
  }

  let resp;
  try {
    resp = await dynamoDb.get({
      TableName: STATEMENT_TABLE,
      Key: {
        year,
        month
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server Error" });
    return;
  }

  if (resp.Item === undefined) {
    res.status(404).json({ message: "Statement not found" });
    return;
  }

  res.status(200).json(resp.Item);
});

app.delete('/statements/:statementID', async (req, res) => {
  const { statementID } = req.params;

  const maxFields = 2;
  let [year, month] = statementID.split('-', maxFields).map(Number);
  if (isNaN(year) || isNaN(month)) {
    res.status(400).json({ error: "Invalid statement ID." });
    return;
  }

  try {
    const resp = await dynamoDb.delete({
      TableName: STATEMENT_TABLE,
      Key: {
        year,
        month
      }, 
      ReturnValues: "ALL_OLD"
    });
    console.log(resp);

    const { Attributes } = resp;
    if (!Attributes) {
      res.status(404).json({ error: "Statement not found" });
      return;
    }

    res.status(204);
    return;
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server Error" });
  }
});

app.put('/statements/:statementID', async (req, res) => {
  res.status(204);
});


app.use((req, res, next) => {
  return res.status(404).json({
    error: "Not Found",
  });
});


export const handler = serverless(app);
