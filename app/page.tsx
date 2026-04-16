'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import { Heart, MessageCircle, Share2, Plus } from 'lucide-react';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function SecretCircle() {
  const [posts, setPosts] = useState<any[]>([]);
  const [newPostText, setNewPostText] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  useEffect(() => {
    fetchPosts();
  }, []);

  async function fetchPosts() {
    const { data } = await supabase.from('posts').select('*').order('created_at', { ascending: false });
    setPosts(data || []);
  }

  async function createPost() {
    if (!newPostText) return;
    await supabase.from('posts').insert({
      user: "You",
      handle: "@yourhandle",
      text: newPostText,
      image: imagePreview,
      likes: 0
    });
    setNewPostText('');
    setImagePreview(null);
    setShowModal(false);
    fetchPosts();
  }

  return (
    <div className="min-h-screen bg-black text-white flex font-sans">
      {/* SIDEBAR */}
      <div className="w-72 border-r border-gray-800 p-6 fixed h-screen">
        <div className="flex items-center gap-3 mb-10">
          <div className="text-4xl">🔒</div>
          <h1 className="text-4xl font-black">SecretCircle</h1>
        </div>
        <div className="space-y-2 text-xl">
          <div className="flex items-center gap-4 px-6 py-4 hover:bg-gray-900 rounded-3xl cursor-pointer">🏠 Home</div>
          <div className="flex items-center gap-4 px-6 py-4 hover:bg-gray-900 rounded-3xl cursor-pointer">🔍 Explore</div>
          <div className="flex items-center gap-4 px-6 py-4 hover:bg-gray-900 rounded-3xl cursor-pointer">🔔 Notifications</div>
          <div className="flex items-center gap-4 px-6 py-4 hover:bg-gray-900 rounded-3xl cursor-pointer">💬 DMs</div>
        </div>
        <button onClick={() => setShowModal(true)} className="mt-12 w-full bg-white text-black font-bold text-2xl py-5 rounded-3xl hover:scale-105 transition">
          + Drop Secret
        </button>
      </div>

      {/* FEED */}
      <div className="flex-1 ml-72 border-r border-gray-800">
        <div className="sticky top-0 bg-black/90 p-6 border-b border-gray-800 flex justify-between items-center">
          <h2 className="text-3xl font-bold">Home</h2>
          <button onClick={() => alert('Invite code: SC-69X420Y\nSend only to people you trust 🔥')} className="bg-purple-600 px-8 py-3 rounded-3xl font-bold">Share Invite</button>
        </div>

        <div className="p-6 space-y-8 max-w-2xl mx-auto">
          {posts.map((post) => (
            <div key={post.id} className="bg-gray-900 rounded-3xl p-8">
              <div className="flex gap-4">
                <div className="w-12 h-12 bg-gradient-to-br from-pink-500 to-purple-500 rounded-2xl flex items-center justify-center text-3xl">🔥</div>
                <div className="flex-1">
                  <p className="font-bold">{post.user} <span className="text-gray-500">{post.handle}</span></p>
                  <p className="text-gray-400 text-sm">{new Date(post.created_at).toLocaleString()}</p>
                  <p className="text-xl mt-4 leading-relaxed">{post.text}</p>
                  {post.image && <img src={post.image} className="mt-6 rounded-3xl w-full" />}
                  <div className="flex gap-8 mt-8 text-gray-400">
                    <button className="flex items-center gap-3 hover:text-red-500"><Heart /> {post.likes}</button>
                    <button className="flex items-center gap-3 hover:text-blue-500"><MessageCircle /> 12</button>
                    <button className="flex items-center gap-3 hover:text-green-500"><Share2 /></button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* POST MODAL */}
      {showModal && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50">
          <div className="bg-gray-900 rounded-3xl w-full max-w-xl p-8">
            <textarea value={newPostText} onChange={e => setNewPostText(e.target.value)} className="w-full h-48 bg-black border border-gray-700 rounded-3xl p-6 text-xl resize-none" placeholder="Spill the fucking tea..." />
            <div className="flex gap-4 mt-4">
              <label className="cursor-pointer flex-1 bg-gray-800 hover:bg-gray-700 rounded-3xl py-6 text-center text-xl">📸 Image</label>
              <button onClick={() => alert('Voice note coming soon 🔥')} className="flex-1 bg-gray-800 hover:bg-gray-700 rounded-3xl text-3xl">🎤</button>
            </div>
            <div className="flex gap-4 mt-8">
              <button onClick={() => setShowModal(false)} className="flex-1 py-6 text-xl font-bold border border-gray-700 rounded-3xl">Cancel</button>
              <button onClick={createPost} className="flex-1 py-6 text-xl font-bold bg-white text-black rounded-3xl">POST TO THE CIRCLE</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}