'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { BarChart2, X, Plus, Clock } from 'lucide-react';

// --- Poll Composer (used inside post creation) ---
export interface PollData {
  options: string[];
  duration_hours: number;
}

interface PollComposerProps {
  onChange: (poll: PollData | null) => void;
}

export function PollComposer({ onChange }: PollComposerProps) {
  const [options, setOptions] = useState(['', '']);
  const [duration, setDuration] = useState(24);

  const updateOption = (index: number, value: string) => {
    const updated = [...options];
    updated[index] = value;
    setOptions(updated);
    const filled = updated.filter(Boolean);
    if (filled.length >= 2) {
      onChange({ options: updated.filter(Boolean), duration_hours: duration });
    }
  };

  const addOption = () => {
    if (options.length >= 4) return;
    setOptions([...options, '']);
  };

  const removeOption = (index: number) => {
    if (options.length <= 2) return;
    const updated = options.filter((_, i) => i !== index);
    setOptions(updated);
    const filled = updated.filter(Boolean);
    onChange(filled.length >= 2 ? { options: filled, duration_hours: duration } : null);
  };

  const handleDuration = (val: number) => {
    setDuration(val);
    const filled = options.filter(Boolean);
    if (filled.length >= 2) onChange({ options: filled, duration_hours: val });
  };

  return (
    <div className="border border-gray-700 rounded-2xl p-4 mt-3">
      <div className="flex items-center gap-2 mb-3">
        <BarChart2 className="w-4 h-4 text-sky-400" />
        <span className="text-sm font-semibold text-sky-400">Poll</span>
      </div>

      <div className="flex flex-col gap-2">
        {options.map((opt, i) => (
          <div key={i} className="relative">
            <input
              type="text"
              value={opt}
              onChange={(e) => updateOption(i, e.target.value)}
              maxLength={25}
              placeholder={`Choice ${i + 1}${i < 2 ? ' (required)' : ' (optional)'}`}
              className="w-full bg-transparent border border-gray-700 focus:border-sky-500 rounded-xl px-4 py-2.5 text-sm outline-none placeholder-gray-600 pr-10 text-white transition-colors"
            />
            {options.length > 2 && (
              <button
                onClick={() => removeOption(i)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-red-400 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        ))}

        {options.length < 4 && (
          <button
            onClick={addOption}
            className="flex items-center gap-2 text-sky-400 text-sm py-2 px-4 rounded-xl border border-dashed border-gray-700 hover:border-sky-500 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add choice
          </button>
        )}
      </div>

      {/* Duration */}
      <div className="mt-4 flex items-center gap-3">
        <Clock className="w-4 h-4 text-gray-500 flex-shrink-0" />
        <span className="text-sm text-gray-500">Poll length</span>
        <select
          value={duration}
          onChange={(e) => handleDuration(Number(e.target.value))}
          className="ml-auto bg-transparent border border-gray-700 text-sm rounded-lg px-3 py-1.5 outline-none text-white focus:border-sky-500 transition-colors"
        >
          <option value={1} className="bg-black">1 hour</option>
          <option value={6} className="bg-black">6 hours</option>
          <option value={12} className="bg-black">12 hours</option>
          <option value={24} className="bg-black">1 day</option>
          <option value={72} className="bg-black">3 days</option>
          <option value={168} className="bg-black">7 days</option>
        </select>
      </div>
    </div>
  );
}

// --- Poll Display (renders in the feed) ---
interface PollOption {
  id: string;
  text: string;
  votes: number;
}

interface Poll {
  id: string;
  post_id: string;
  options: PollOption[];
  ends_at: string;
  total_votes: number;
}

interface PollDisplayProps {
  postId: string;
  pollId: string;
}

export function PollDisplay({ postId, pollId }: PollDisplayProps) {
  const [poll, setPoll] = useState<Poll | null>(null);
  const [voted, setVoted] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [voting, setVoting] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) setUserId(data.user.id);
    });
  }, []);

  useEffect(() => {
    const fetchPoll = async () => {
      const { data: pollData } = await supabase
        .from('polls')
        .select('id, post_id, ends_at')
        .eq('id', pollId)
        .single();
      if (!pollData) return;

      const { data: options } = await supabase
        .from('poll_options')
        .select('id, text, votes')
        .eq('poll_id', pollId)
        .order('created_at');

      if (!options) return;

      const total = options.reduce((sum, o) => sum + (o.votes || 0), 0);
      setPoll({ ...pollData, options: options as PollOption[], total_votes: total });
    };

    fetchPoll();
  }, [pollId]);

  useEffect(() => {
    if (!userId || !pollId) return;
    supabase
      .from('poll_votes')
      .select('option_id')
      .eq('poll_id', pollId)
      .eq('user_id', userId)
      .maybeSingle()
      .then(({ data }) => { if (data) setVoted(data.option_id); });
  }, [userId, pollId]);

  const vote = async (optionId: string) => {
    if (!userId || voted || voting) return;
    setVoting(true);
    const { error } = await supabase.from('poll_votes').insert({
      poll_id: pollId,
      option_id: optionId,
      user_id: userId,
    });
    if (!error) {
      setVoted(optionId);
      // Increment vote count
      await supabase.rpc('increment_poll_vote', { option_id: optionId });
      // Refresh poll data
      const { data: options } = await supabase
        .from('poll_options')
        .select('id, text, votes')
        .eq('poll_id', pollId)
        .order('created_at');
      if (options && poll) {
        const total = options.reduce((sum, o) => sum + (o.votes || 0), 0);
        setPoll({ ...poll, options: options as PollOption[], total_votes: total });
      }
    }
    setVoting(false);
  };

  if (!poll) return null;

  const isExpired = new Date(poll.ends_at) < new Date();
  const showResults = voted !== null || isExpired;
  const maxVotes = Math.max(...poll.options.map((o) => o.votes || 0), 1);

  const timeLeft = () => {
    if (isExpired) return 'Final results';
    const diff = new Date(poll.ends_at).getTime() - Date.now();
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(hours / 24);
    if (days > 0) return `${days}d left`;
    if (hours > 0) return `${hours}h left`;
    return 'Ending soon';
  };

  return (
    <div className="mt-3 flex flex-col gap-2">
      {poll.options.map((option) => {
        const pct = poll.total_votes > 0 ? Math.round((option.votes / poll.total_votes) * 100) : 0;
        const isWinner = showResults && option.votes === maxVotes && poll.total_votes > 0;
        const isMyVote = voted === option.id;

        return (
          <button
            key={option.id}
            onClick={() => vote(option.id)}
            disabled={showResults || voting}
            className={`relative w-full rounded-xl overflow-hidden text-left transition-colors ${
              showResults
                ? 'cursor-default'
                : 'hover:border-sky-500 cursor-pointer'
            } border ${isMyVote ? 'border-sky-500' : 'border-gray-700'}`}
          >
            {/* Progress bar */}
            {showResults && (
              <div
                className={`absolute inset-y-0 left-0 transition-all duration-700 ${
                  isWinner ? 'bg-sky-500/20' : 'bg-gray-800/50'
                }`}
                style={{ width: `${pct}%` }}
              />
            )}

            <div className="relative px-4 py-2.5 flex items-center justify-between">
              <span className={`text-sm ${isMyVote ? 'font-bold text-sky-400' : 'text-white'}`}>
                {option.text}
              </span>
              {showResults && (
                <span className={`text-sm font-bold ml-2 flex-shrink-0 ${isWinner ? 'text-sky-400' : 'text-gray-400'}`}>
                  {pct}%
                </span>
              )}
            </div>
          </button>
        );
      })}

      <p className="text-xs text-gray-500 mt-1">
        {poll.total_votes.toLocaleString()} vote{poll.total_votes !== 1 ? 's' : ''} · {timeLeft()}
      </p>
    </div>
  );
}