import React, { useState, useEffect } from 'react';
import './App.css';
import {
  ApolloClient,
  InMemoryCache,
  ApolloProvider,
  useQuery,
  useSubscription,
  useMutation,
  split,
  gql,
} from '@apollo/client';
import { createUploadLink } from 'apollo-upload-client';
import { WebSocketLink } from '@apollo/client/link/ws';
import { getMainDefinition } from '@apollo/client/utilities';

const GET_MESSAGES = gql`
  query {
    messages {
      id
      sender
      content
      file {
        filename
        url
        mimetype
      }
    }
  }
`;

const MESSAGE_SUBSCRIPTION = gql`
  subscription {
    messageAdded {
      id
      sender
      content
      file {
        filename
        url
        mimetype
      }
    }
  }
`;

// Add POST_MESSAGE mutation same as sender
const POST_MESSAGE = gql`
  mutation($sender: String!, $content: String, $file: Upload) {
    postMessage(sender: $sender, content: $content, file: $file) {
      id
      sender
      content
      file {
        filename
        mimetype
        url
      }
    }
  }
`;

const httpLink = createUploadLink({
  uri: 'http://localhost:4000/graphql',
});

const wsLink = new WebSocketLink({
  uri: 'ws://localhost:4000/graphql',
  options: { reconnect: true },
});

const splitLink = split(
  ({ query }) => {
    const def = getMainDefinition(query);
    return def.kind === 'OperationDefinition' && def.operation === 'subscription';
  },
  wsLink,
  httpLink
);

const client = new ApolloClient({
  link: splitLink,
  cache: new InMemoryCache(),
});

const Receiver = () => {
  const [messages, setMessages] = useState([]);
  const [file, setFile] = useState(null);
  const [sender, setSender] = useState('');
  const [uploaded, setUploaded] = useState(null);

  const { loading, error, data } = useQuery(GET_MESSAGES, {
    fetchPolicy: 'network-only',
    pollInterval: 500, // ⏱️ continuously fetch every 1 sec
  });

  const [uploadFile] = useMutation(POST_MESSAGE);

  const handleFileChange = (e) => {
    setFile(e.target.files[0]);
  };

  const handleUpload = async () => {
    if (!file || !sender) return;
    try {
      const { data } = await uploadFile({
        variables: {
          sender,
          content: null,
          file,
        },
      });
      setUploaded(data.postMessage.file);
      setFile(null);
    } catch (err) {
      console.error('Upload failed:', err);
    }
  };

  useEffect(() => {
    if (data && data.messages) {
      setMessages(data.messages);
      console.log('✅ Fetched messages:', data.messages);
    }
  }, [data]);

  useSubscription(MESSAGE_SUBSCRIPTION, {
    onData: ({ data }) => {
      const newMsg = data.data.messageAdded;
      setMessages((prev) => {
        if (prev.some((msg) => msg.id === newMsg.id)) return prev;
        return [...prev, newMsg];
      });
    },
  });

  if (loading) return <p>Loading messages...</p>;
  if (error) return <p>Error fetching messages</p>;

  return (
    <div style={{ padding: 20 }}>
      <h2>📥 Receiver</h2>
      {/* Upload UI */}
      <input
        placeholder="Your Name"
        value={sender}
        onChange={(e) => setSender(e.target.value)}
        style={{ marginBottom: 10 }}
      />
      <br />
      <input type="file" onChange={handleFileChange} />
      <button onClick={handleUpload} disabled={!file || !sender}>
        Upload
      </button>

      {uploaded && (
        <div style={{ marginTop: 20 }}>
          <h4>Uploaded File:</h4>
          <p><strong>Filename:</strong> {uploaded.filename}</p>
          <p><strong>Type:</strong> {uploaded.mimetype}</p>
          <a href={uploaded.url} target="_blank" rel="noreferrer">
            View / Download
          </a>
        </div>
      )}

      {/* Existing messages display */}
      {messages.map((msg) => (
        <div key={msg.id} style={{ marginBottom: 15 }}>
          <strong>{msg.sender}:</strong> {msg.content && <span>{msg.content}</span>}
          {msg.file && (
            <div style={{ marginTop: 5 }}>
              {msg.file.mimetype.startsWith('image/') ? (
                <img src={msg.file.url} alt={msg.file.filename} style={{ maxWidth: '200px' }} />
              ) : msg.file.mimetype.startsWith('audio/') ? (
                <audio controls>
                  <source src={msg.file.url} type={msg.file.mimetype} />
                </audio>
              ) : msg.file.mimetype.startsWith('video/') ? (
                <video controls width="300">
                  <source src={msg.file.url} type={msg.file.mimetype} />
                </video>
              ) : (
                <a href={msg.file.url} target="_blank" rel="noopener noreferrer">
                  📄 {msg.file.filename}
                </a>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

export default function App() {
  return (
    <ApolloProvider client={client}>
      <Receiver />
    </ApolloProvider>
  );
}
