'use client';

import React, { createContext, useContext, useState, ReactNode } from 'react';
import { Meeting } from '@/lib/types/meeting';

interface MeetingContextType {
  meetings: Meeting[];
  setMeetings: (meetings: Meeting[]) => void;
  selectedMeeting: Meeting | null;
  setSelectedMeeting: (meeting: Meeting | null) => void;
  loading: boolean;
  setLoading: (loading: boolean) => void;
}

const MeetingContext = createContext<MeetingContextType | undefined>(undefined);

export function MeetingProvider({ children }: { children: ReactNode }) {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [selectedMeeting, setSelectedMeeting] = useState<Meeting | null>(null);
  const [loading, setLoading] = useState(false);

  return (<MeetingContext.Provider value={{ meetings, setMeetings, selectedMeeting, setSelectedMeeting, loading, setLoading }}>{children}</MeetingContext.Provider>);
}

export function useMeeting() {
  const context = useContext(MeetingContext);
  if (context === undefined) { throw new Error('useMeeting must be used within a MeetingProvider'); }
  return context;
}