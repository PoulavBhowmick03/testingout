// FullApp.tsx

import React, { useEffect, useState } from "react";
import { FaArrowUp, FaArrowDown } from 'react-icons/fa';
import Sidebar from '../components/sidebar';
import { createLightNode, waitForRemotePeer, DecodedMessage, LightNode, createDecoder, createEncoder } from "@waku/sdk";
import protobuf from "protobufjs";

// Types
export interface IPollMessage {
  id: string;
  question: string;
  answers: string[];
  votes: IVoteMessage[];
}

export interface IVoteMessage {
  postId: number;
  vote: number; // 1 for upvote, -1 for downvote
}

// Protobuf
const contentTopic = "/wapoll/0";
const encoder = createEncoder({ contentTopic });
const decoder = createDecoder(contentTopic);

const root = protobuf.Root.fromJSON({
    nested: {
      PollVote: {
        fields: {
          postId: {
            type: "int32",
            id: 1,
          },
          vote: {
            type: "int32",
            id: 2,
          },
        },
      },
      PollMessage: {
        fields: {
          id: {
            type: "string",
            id: 1,
          },
          question: {
            type: "string",
            id: 2,
          },
          answers: {
            rule: "repeated",
            type: "string",
            id: 3,
          },
          votes: {
            rule: "repeated",
            type: "PollVote",
            id: 4,
          },
        },
      },
    },
  });
  
  const PPollVote = root.lookupType("PollVote");
  const PPollMessage = root.lookupType("PollMessage");
  // Waku Library Functions
  export const createNode = async () => {
    const waku = await createLightNode({ defaultBootstrap: true });
    await waitForRemotePeer(waku);
  
    // Ensure that the 'lightPush' property is available
    if (!waku.lightPush) {
      throw new Error("LightPush extension is not available.");
    }
  
    return waku;
  };
  
export const receiveVotes = async (
  waku: LightNode,
  callback: (pollMessage: IPollMessage) => void,
) => {
  const _callback = (wakuMessage: DecodedMessage): void => {
    if (!wakuMessage.payload) return;
    const pollMessageObj = PPollMessage.decode(wakuMessage.payload);
    const pollMessage = pollMessageObj.toJSON() as IPollMessage;
    callback(pollMessage);
  };

  const unsubscribe = await waku.filter.subscribe([decoder], _callback);
  return unsubscribe;
};

export const sendVote = async (waku: LightNode, pollMessage: IPollMessage) => {
  const protoMessage = PPollMessage.create({
    id: pollMessage.id,
    question: pollMessage.question,
    answers: pollMessage.answers,
    votes: pollMessage.votes,
  });

  // Serialise the message using Protobuf
  const serialisedMessage = PPollMessage.encode(protoMessage).finish();

  // Send the message using Light Push
  await waku.lightPush.send(encoder, {
    payload: serialisedMessage,
  });
};

export const retrieveExistingVotes = async (
  waku: LightNode,
  callback: (pollMessage: IPollMessage) => void,
) => {
  const _callback = (wakuMessage: DecodedMessage): void => {
    if (!wakuMessage.payload) return;
    const pollMessageObj = PPollMessage.decode(wakuMessage.payload);
    const pollMessage = pollMessageObj.toJSON() as IPollMessage;
    callback(pollMessage);
  };

  // Query the Store peer
  await waku.store.queryWithOrderedCallback([decoder], _callback);
};

// Proposal Forum Component
const FullApp: React.FC = () => {
    const [wakuNode, setWakuNode] = useState<LightNode | null>(null);
    const [posts, setPosts] = useState<IPost[]>([]);
    const [showModal, setShowModal] = useState(false);
    const [newPost, setNewPost] = useState<IPost>({ id: 0, title: '', content: '', votes: 0 });
  
    useEffect(() => {
      if (!wakuNode) return; // Exit early if wakuNode is not yet initialized
  
      const handleVote = (postId: number, vote: number) => {
        // Send vote message using Waku
        sendVote(wakuNode, {
          id: "uniqueId", // Use a unique identifier for the poll message
          question: "Vote on Post",
          answers: [], // No options for a post vote
          votes: [{ postId, vote }],
        });
      };
  
      const processReceivedVote = (pollMessage: IPollMessage) => {
        if (pollMessage.votes && Array.isArray(pollMessage.votes)) {
          pollMessage.votes.forEach((vote) => {
            const postIndex = posts.findIndex((post) => post.id === vote.postId);
            if (postIndex !== -1) {
              setPosts((prevPosts) => {
                const newPosts = [...prevPosts];
                newPosts[postIndex].votes += vote.vote;
                return newPosts;
              });
            }
          });
        }
      };
  
      // Subscribe to votes
      receiveVotes(wakuNode, processReceivedVote);
  
      // Retrieve existing votes
      retrieveExistingVotes(wakuNode, processReceivedVote);
    }, [wakuNode, posts]);
  const handleVote = (postId: number, vote: number) => {
    // Send vote message using Waku
    sendVote(wakuNode!, {
      id: "uniqueId", // Use a unique identifier for the poll message
      question: "Vote on Post",
      answers: [], // No options for a post vote
      votes: [{ postId, vote }],
    });
  };

  const handleAddPost = (post: IPost) => {
    setPosts([post, ...posts]);
  };

  const handleNewPost = () => {
    if (newPost.title && newPost.content) {
      handleAddPost({
        ...newPost,
        id: posts.length + 1,
      });

      setNewPost({ id: 0, title: '', content: '', votes: 0 });
      setShowModal(false);
    }
  };

  const processReceivedVote = (pollMessage: IPollMessage) => {
    if (pollMessage.votes && Array.isArray(pollMessage.votes)) {
      pollMessage.votes.forEach((vote) => {
        const postIndex = posts.findIndex((post) => post.id === vote.postId);
        if (postIndex !== -1) {
          setPosts((prevPosts) => {
            const newPosts = [...prevPosts];
            newPosts[postIndex].votes += vote.vote;
            return newPosts;
          });
        }
      });
    }
  };
  

  return (
    <div className="flex h-full">
      <Sidebar />
      <div className="flex flex-col flex-grow bg-gradient-to-b from-purple-900 via-purple-800 to-black text-white">
        {/* Header */}
        <header className="bg-gradient-to-r from-black via-purple-800 to-purple-900 p-4 flex justify-between items-center">
          <span className="font-bold text-xl">Proposals</span>
          <button
            className="px-2 py-1 bg-purple-500 hover:bg-purple-600 rounded"
            onClick={() => setShowModal(true)}
          >
            + New Post
          </button>
        </header>

        {/* Posts */}
        <main className="px-2 py-8 flex-1 overflow-y-auto">
          {posts.map(post => (
            <Post key={post.id} post={post} onVote={handleVote} />
          ))}
        </main>

        {/* New Post Modal */}
        {showModal && (
          <div className="modal-overlay flex items-center justify-center">
            <div className="modal glassmorphism p-6 rounded">
              <h2 className="text-2xl font-bold mb-4">New Post</h2>
              <label htmlFor="postTitle" className="block mb-2">
                Title:
                <input
                  type="text"
                  id="postTitle"
                  className="border p-1 text-black"
                  value={newPost.title}
                  onChange={(e) => setNewPost({ ...newPost, title: e.target.value })}
                />
              </label>
              <label htmlFor="postContent" className="block mb-4">
                Content:
                <textarea
                  id="postContent"
                  className="border p-1 text-black"
                  value={newPost.content}
                  onChange={(e) => setNewPost({ ...newPost, content: e.target.value })}
                />
              </label>
              <button className="bg-purple-500 text-white p-2 rounded" onClick={handleNewPost}>
                Post
              </button>
              <button
                className="bg-gray-500 text-white p-2 rounded ml-2"
                onClick={() => setShowModal(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// Post component
interface IPost {
  id: number;
  title: string;
  content: string;
  votes: number;
}

function Post({ post, onVote }: { post: IPost; onVote: (postId: number, vote: number) => void }) {
  const { id, title, content, votes } = post;

  return (
    <article className="bg-gradient-to-r from-purple-800 to-purple-700 p-5 rounded my-4 relative border border-purple-900 bg-opacity-20 backdrop-blur-lg">
      <div className="glassmorphism p-4">
        <div className="flex items-center mb-2">
          <button className="text-xl mr-2" onClick={() => onVote(id, 1)}>
            <FaArrowUp />
          </button>
          <button className="text-xl" onClick={() => onVote(id, -1)}>
            <FaArrowDown />
          </button>
        </div>
        <h2 className="text-xl mb-2">{title}</h2>
        <p>{content}</p>
        <div className="flex justify-between text-sm text-purple-400 mt-4">
          <p>{votes} votes</p>
        </div>
      </div>
    </article>
  );
}

export default FullApp;
