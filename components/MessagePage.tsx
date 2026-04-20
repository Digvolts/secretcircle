'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { ArrowLeft, Send, Search, MessageSquare } from 'lucide-react';

interface UserProfile {
  id: string;
  username: string;
  avatar?: string | null;
}

interface Message {
  id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  read_at: string | null;
  created_at: string;
}

interface Conversation {
  partner: UserProfile;
  lastMessage: Message;
  unreadCount: number;
}

export default function MessagesPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activePartner, setActivePartner] = useState<UserProfile | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<UserProfile[]>([]);
  const [loadingConvos, setLoadingConvos] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) setUserId(data.user.id);
    });
  }, []);

  // Scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Fetch conversations
  const fetchConversations = useCallback(async () => {
    if (!userId) return;
    setLoadingConvos(true);
    const { data } = await supabase
      .from('messages')
      .select(`id, sender_id, receiver_id, content, read_at, created_at`)
      .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
      .order('created_at', { ascending: false });

    if (!data) { setLoadingConvos(false); return; }

    // Group by partner
    const partnerMap = new Map<string, { messages: Message[]; unread: number }>();
    for (const msg of data as Message[]) {
      const partnerId = msg.sender_id === userId ? msg.receiver_id : msg.sender_id;
      if (!partnerMap.has(partnerId)) {
        partnerMap.set(partnerId, { messages: [], unread: 0 });
      }
      const entry = partnerMap.get(partnerId)!;
      entry.messages.push(msg);
      if (msg.receiver_id === userId && !msg.read_at) entry.unread++;
    }

    // Fetch partner profiles
    const partnerIds = Array.from(partnerMap.keys());
    if (partnerIds.length === 0) { setLoadingConvos(false); return; }

    const { data: profiles } = await supabase
      .from('users')
      .select('id, username, avatar')
        .in('id', partnerIds);

    if (!profiles) { setLoadingConvos(false); return; }

    const convos: Conversation[] = profiles.map((p: UserProfile) => {
      const entry = partnerMap.get(p.id)!;
      return { partner: p, lastMessage: entry.messages[0], unreadCount: entry.unread };
    });
    convos.sort((a, b) => new Date(b.lastMessage.created_at).getTime() - new Date(a.lastMessage.created_at).getTime());
    setConversations(convos);
    setLoadingConvos(false);
  }, [userId]);

  useEffect(() => {
    if (userId) fetchConversations();
  }, [userId, fetchConversations]);

  // Fetch messages for a conversation
  const openConversation = async (partner: UserProfile) => {
    setActivePartner(partner);
    setLoadingMessages(true);
    const { data } = await supabase
      .from('messages')
      .select('*')
      .or(
        `and(sender_id.eq.${userId},receiver_id.eq.${partner.id}),and(sender_id.eq.${partner.id},receiver_id.eq.${userId})`
      )
      .order('created_at', { ascending: true });

    if (data) setMessages(data as Message[]);

    // Mark messages from partner as read
    await supabase
      .from('messages')
      .update({ read_at: new Date().toISOString() })
      .eq('sender_id', partner.id)
      .eq('receiver_id', userId!)
      .is('read_at', null);

    setLoadingMessages(false);
  };

  // Real-time messages
  useEffect(() => {
    if (!userId || !activePartner) return;
    const channel = supabase
      .channel(`dm-${userId}-${activePartner.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload) => {
          const msg = payload.new as Message;
          const isRelevant =
            (msg.sender_id === userId && msg.receiver_id === activePartner.id) ||
            (msg.sender_id === activePartner.id && msg.receiver_id === userId);
          if (isRelevant) setMessages((prev) => [...prev, msg]);
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userId, activePartner]);

  // Search users
  useEffect(() => {
    if (!searchQuery.trim()) { setSearchResults([]); return; }
    const timeout = setTimeout(async () => {
      const { data } = await supabase
        .from('users')
        .select('id, username, avatar')
        .ilike('username', `%${searchQuery}%`)
        .neq('id', userId!)
        .limit(8);
      if (data) setSearchResults(data as UserProfile[]);
    }, 300);
    return () => clearTimeout(timeout);
  }, [searchQuery, userId]);

  // Send message
  const sendMessage = async () => {
    if (!input.trim() || !userId || !activePartner || sending) return;
    setSending(true);
    const content = input.trim();
    setInput('');
    const { error } = await supabase.from('messages').insert({
      sender_id: userId,
      receiver_id: activePartner.id,
      content,
    });
    if (!error) fetchConversations();
    setSending(false);
  };

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
  };

  const formatConvoDate = (dateStr: string) => {
    const d = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    if (hours < 24) return formatTime(dateStr);
    if (days < 7) return `${days}d`;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const Avatar = ({ user, size = 'md' }: { user: UserProfile; size?: 'sm' | 'md' | 'lg' }) => {
    const s = size === 'sm' ? 'w-8 h-8 text-xs' : size === 'lg' ? 'w-12 h-12 text-base' : 'w-10 h-10 text-sm';
    return user.avatar ? (
      <img src={user.avatar} alt={user.username} className={`${s} rounded-full object-cover flex-shrink-0`} />
    ) : (
      <div className={`${s} rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center font-bold flex-shrink-0 text-white`}>
        🔥
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-black text-white flex">
      <div className="max-w-5xl w-full mx-auto border-x border-gray-800 flex min-h-screen">

        {/* Sidebar — Conversations */}
        <div className={`${activePartner ? 'hidden md:flex' : 'flex'} flex-col w-full md:w-80 border-r border-gray-800 flex-shrink-0`}>
          <div className="sticky top-0 bg-black/80 backdrop-blur-md border-b border-gray-800 px-4 py-3">
            <h1 className="text-xl font-bold mb-3">Messages</h1>
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input
                type="text"
                placeholder="Search people..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-gray-900 rounded-full pl-9 pr-4 py-2 text-sm outline-none focus:ring-1 focus:ring-sky-500 placeholder-gray-600"
              />
            </div>
            {/* Search results */}
            {searchResults.length > 0 && (
              <div className="absolute left-0 right-0 mt-1 bg-gray-900 border border-gray-700 rounded-xl shadow-xl z-20 overflow-hidden mx-4">
                {searchResults.map((u) => (
                  <button
                    key={u.id}
                    onClick={() => { setSearchQuery(''); setSearchResults([]); openConversation(u); }}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-800 transition-colors"
                  >
                    <Avatar user={u} size="sm" />
                    <div className="text-left min-w-0">
                      <p className="font-medium text-sm truncate">{u.username}</p>
                      <p className="text-gray-500 text-xs truncate">@{u.username}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Conversation list */}
          <div className="flex-1 overflow-y-auto">
            {loadingConvos ? (
              <div className="flex flex-col">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="px-4 py-3 flex gap-3 animate-pulse">
                    <div className="w-10 h-10 rounded-full bg-gray-800 flex-shrink-0" />
                    <div className="flex-1 space-y-2">
                      <div className="h-3 bg-gray-800 rounded w-1/2" />
                      <div className="h-3 bg-gray-800 rounded w-3/4" />
                    </div>
                  </div>
                ))}
              </div>
            ) : conversations.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
                <MessageSquare className="w-10 h-10 text-gray-600 mb-3" />
                <p className="text-gray-500 text-sm">No messages yet. Search for someone to start a conversation.</p>
              </div>
            ) : (
              conversations.map((convo) => (
                <button
                  key={convo.partner.id}
                  onClick={() => openConversation(convo.partner)}
                  className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-white/[0.03] transition-colors ${
                    activePartner?.id === convo.partner.id ? 'bg-white/[0.05]' : ''
                  }`}
                >
                  <Avatar user={convo.partner} />
                  <div className="flex-1 min-w-0 text-left">
                    <div className="flex items-center justify-between">
                      <span className={`text-sm ${convo.unreadCount > 0 ? 'font-bold' : 'font-medium'}`}>
                        {convo.partner.username}
                      </span>
                      <span className="text-xs text-gray-500 flex-shrink-0">
                        {formatConvoDate(convo.lastMessage.created_at)}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <p className={`text-xs truncate flex-1 ${convo.unreadCount > 0 ? 'text-white' : 'text-gray-500'}`}>
                        {convo.lastMessage.sender_id === userId ? 'You: ' : ''}{convo.lastMessage.content}
                      </p>
                      {convo.unreadCount > 0 && (
                        <span className="w-4 h-4 rounded-full bg-sky-500 text-white text-xs flex items-center justify-center flex-shrink-0">
                          {convo.unreadCount}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Chat Panel */}
        <div className={`${activePartner ? 'flex' : 'hidden md:flex'} flex-col flex-1 min-w-0`}>
          {!activePartner ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center px-8">
              <MessageSquare className="w-16 h-16 text-gray-700 mb-4" />
              <h2 className="text-2xl font-bold mb-2">Your Messages</h2>
              <p className="text-gray-500 text-sm">Send private messages to anyone on the platform.</p>
            </div>
          ) : (
            <>
              {/* Chat header */}
              <div className="sticky top-0 bg-black/80 backdrop-blur-md border-b border-gray-800 px-4 py-3 flex items-center gap-3">
                <button onClick={() => setActivePartner(null)} className="md:hidden p-1 rounded-full hover:bg-gray-800">
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <Avatar user={activePartner} />
                <div>
                  <p className="font-bold text-sm">{activePartner.username}</p>
                  <p className="text-gray-500 text-xs">@{activePartner.username}</p>
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-2">
                {loadingMessages ? (
                  <div className="flex-1 flex items-center justify-center">
                    <div className="w-6 h-6 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : messages.length === 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center text-center py-12">
                    <p className="text-gray-500 text-sm">No messages yet. Say hello!</p>
                  </div>
                ) : (
                  messages.map((msg, i) => {
                    const isMine = msg.sender_id === userId;
                    const showTime = i === messages.length - 1 || 
                      new Date(messages[i+1].created_at).getTime() - new Date(msg.created_at).getTime() > 300000;
                    return (
                      <div key={msg.id} className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}>
                        <div className={`max-w-xs lg:max-w-sm px-4 py-2 rounded-2xl text-sm leading-relaxed ${
                          isMine
                            ? 'bg-sky-500 text-white rounded-br-sm'
                            : 'bg-gray-800 text-white rounded-bl-sm'
                        }`}>
                          {msg.content}
                        </div>
                        {showTime && (
                          <span className="text-xs text-gray-600 mt-1 px-1">
                            {formatTime(msg.created_at)}
                            {isMine && msg.read_at && <span className="ml-1">· Read</span>}
                          </span>
                        )}
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Message input */}
              <div className="border-t border-gray-800 px-4 py-3">
                <div className="flex items-center gap-3 bg-gray-900 rounded-full px-4 py-2">
                  <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage()}
                    placeholder="Start a new message"
                    className="flex-1 bg-transparent text-sm outline-none placeholder-gray-600"
                  />
                  <button
                    onClick={sendMessage}
                    disabled={!input.trim() || sending}
                    className="p-1.5 rounded-full bg-sky-500 text-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-sky-400 transition-colors"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}