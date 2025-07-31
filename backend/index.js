import { ApolloServer, gql } from 'apollo-server-express';
import express from 'express';
import fs from 'fs';
import { execute, subscribe } from 'graphql';
import { PubSub } from 'graphql-subscriptions';
import { GraphQLUpload, graphqlUploadExpress } from 'graphql-upload';
import http from 'http';
import path, { dirname } from 'path';
import { SubscriptionServer } from 'subscriptions-transport-ws';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';

// ⛳ Required for __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ✅ Create uploads directory if not present
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}

const app = express();

// ✅ Root route to avoid "Cannot GET /"
app.get('/', (req, res) => {
  res.send('🚀 GraphQL File Sharing Server is running! Use POST /graphql');
});

// ✅ Serve static uploaded files
app.use('/uploads', express.static(uploadsDir));

// ✅ Enable multipart/form-data parsing for file uploads
app.use(graphqlUploadExpress());

// ✅ PubSub for subscription events
const pubsub = new PubSub();
const MESSAGE_ADDED = 'MESSAGE_ADDED';

// ✅ In-memory message store
let messages = [];

// ✅ GraphQL Schema
const typeDefs = gql`
  scalar Upload

  type File {
    filename: String!
    mimetype: String!
    encoding: String!
    url: String!
  }

  type Message {
    id: ID!
    sender: String!
    content: String
    file: File
  }

  type Query {
    messages: [Message]
  }

  type Mutation {
    postMessage(sender: String!, content: String, file: Upload): Message
  }

  type Subscription {
    messageAdded: Message
  }
`;

// ✅ GraphQL Resolvers
const resolvers = {
  Upload: GraphQLUpload,

  Query: {
    messages: () => messages,
  },

  Mutation: {
    postMessage: async (_, { sender, content, file }) => {
      let fileData = null;

      if (file && typeof file.then === 'function') {
        const upload = await file;
        const { createReadStream, filename, mimetype, encoding } = upload;
        const stream = createReadStream();
        const filepath = path.join(uploadsDir, filename);

        // Save file to disk
        await new Promise((resolve, reject) => {
          const writeStream = fs.createWriteStream(filepath);
          stream.pipe(writeStream);
          writeStream.on('finish', resolve);
          writeStream.on('error', reject);
        });

        fileData = {
          filename,
          mimetype,
          encoding,
          url: `http://localhost:4000/uploads/${filename}`,
        };
      }

      const message = {
        id: uuidv4(),
        sender,
        content,
        file: fileData,
      };

      messages.push(message);

      // ✅ Publish message to subscriptions
      pubsub.publish(MESSAGE_ADDED, { messageAdded: message });

      return message;
    },
  },

  Subscription: {
    messageAdded: {
      subscribe: () => pubsub.asyncIterator([MESSAGE_ADDED]),
    },
  },
};

// ✅ Apollo Server Setup
const apolloServer = new ApolloServer({
  typeDefs,
  resolvers,
  subscriptions: false, // handled manually below
  plugins: [
    {
      async serverWillStart() {
        return {
          async drainServer() {
            subscriptionServer.close();
          },
        };
      },
    },
  ],
});

await apolloServer.start();
apolloServer.applyMiddleware({ app });

// ✅ Create HTTP server
const httpServer = http.createServer(app);

// ✅ WebSocket subscription server
const subscriptionServer = SubscriptionServer.create(
  {
    schema: apolloServer.schema,
    execute,
    subscribe,
    onConnect: () => {
      console.log('📡 WebSocket connected for subscriptions');
    },
    onDisconnect: () => {
      console.log('❌ WebSocket disconnected');
    },
  },
  {
    server: httpServer,
    path: apolloServer.graphqlPath,
  }
);

// ✅ Start server
const PORT = 4000;

httpServer.listen(PORT, () => {
  console.log(`🚀 GraphQL ready at http://localhost:${PORT}${apolloServer.graphqlPath}`);
  console.log(`📡 Subscriptions ready at ws://localhost:${PORT}${apolloServer.graphqlPath}`);
});
