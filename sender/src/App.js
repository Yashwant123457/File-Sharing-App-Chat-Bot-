import {
  ApolloClient,
  ApolloProvider,
  gql,
  InMemoryCache,
  split,
  useMutation,
  useQuery,
  useSubscription,
} from '@apollo/client';
import { WebSocketLink } from '@apollo/client/link/ws';
import { getMainDefinition } from '@apollo/client/utilities';
import { createUploadLink } from 'apollo-upload-client';
import { useEffect, useState } from 'react';
import './App.css';

// GraphQL queries and mutations
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

// Apollo client setup with upload link and subscription support
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

const Sender = () => {
  const [file, setFile] = useState(null);
  const [sender, setSender] = useState('');
  const [uploaded, setUploaded] = useState(null);
  const [messages, setMessages] = useState([]);

  const { loading, error, data } = useQuery(GET_MESSAGES, {
    fetchPolicy: 'network-only',
    pollInterval: 500,
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
  if (error) return <p>Error loading messages</p>;

  return (
    <div style={{ padding: 20 }}>
      <h2>Sender - Upload File</h2>
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

      {/* Display messages */}
      {messages.map((msg) => (
        <div key={msg.id} style={{ marginTop: 15 }}>
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

// App wrapper
export default function App() {
  return (
    <ApolloProvider client={client}>
      <Sender />
    </ApolloProvider>
  );
}
