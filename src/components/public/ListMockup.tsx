import React from 'react';
import { Calendar, Clock, Video, MoreVertical, Plus, Search, Filter } from 'lucide-react';

export function ListMockup() {
  return (
    <div className="w-full h-auto bg-[#F8FAFC]  rounded-2xl md:rounded-[2rem] border border-slate-200  shadow-2xl overflow-hidden flex flex-col font-sans">
      {/* Top Header */}
      <div className="h-16 bg-white  flex items-center justify-between px-6 border-b border-slate-200 ">
        <h2 className="font-bold text-lg text-slate-900 ">Upcoming Meetings</h2>
        <div className="flex items-center gap-3">
          <div className="relative hidden sm:block">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input type="text" placeholder="Search..." className="pl-9 pr-4 py-1.5 rounded-full bg-slate-100  border-none text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-48" />
          </div>
          <button className="p-2 rounded-full hover:bg-slate-100 :bg-slate-800 text-slate-500 ">
            <Filter className="w-4 h-4" />
          </button>
          <button className="flex items-center gap-2 bg-blue-600 text-white px-4 py-1.5 rounded-full text-sm font-semibold hover:bg-blue-700 shadow-md">
            <Plus className="w-4 h-4" /> New
          </button>
        </div>
      </div>

      {/* List Content */}
      <div className="flex-1 p-6 space-y-4">
        {[
          { title: "Weekly Sync - Product Team", time: "10:00 AM - 11:00 AM", date: "Today", attendees: 8, color: "bg-blue-50 text-blue-600" },
          { title: "Q3 Roadmap Planning", time: "1:30 PM - 3:00 PM", date: "Today", attendees: 12, color: "bg-purple-50 text-purple-600" },
          { title: "Client Discovery Call", time: "10:00 AM - 10:45 AM", date: "Tomorrow", attendees: 3, color: "bg-green-50 text-green-600" },
          { title: "Design Review: Mobile App", time: "2:00 PM - 3:00 PM", date: "Tomorrow", attendees: 5, color: "bg-orange-50 text-orange-600" },
        ].map((meeting, i) => (
          <div key={i} className="bg-white  p-4 rounded-2xl border border-slate-200  shadow-sm flex items-center justify-between group hover:shadow-md transition-shadow">
            <div className="flex items-center gap-4">
              <div className={`w-12 h-12 rounded-xl ${meeting.color} flex items-center justify-center font-bold text-lg  `}>
                <Video className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900  text-sm md:text-base">{meeting.title}</h3>
                <div className="flex items-center gap-3 text-xs md:text-sm text-slate-500 mt-1">
                  <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" /> {meeting.date}</span>
                  <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> {meeting.time}</span>
                </div>
              </div>
            </div>
            
            <div className="flex items-center gap-4">
              <div className="hidden sm:flex -space-x-2">
                {[1,2,3].map(j => (
                  <img key={j} src={`https://i.pravatar.cc/100?img=${i * 5 + j}`} className="w-8 h-8 rounded-full border-2 border-white  bg-slate-200" />
                ))}
                {meeting.attendees > 3 && (
                  <div className="w-8 h-8 rounded-full border-2 border-white  bg-slate-100  flex items-center justify-center text-[10px] font-bold text-slate-500">
                    +{meeting.attendees - 3}
                  </div>
                )}
              </div>
              <button className="px-4 py-1.5 rounded-full bg-blue-50 text-blue-600   text-sm font-semibold hover:bg-blue-100 :bg-blue-500/20 transition-colors hidden md:block">
                Join
              </button>
              <button className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 :bg-slate-800">
                <MoreVertical className="w-5 h-5" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
