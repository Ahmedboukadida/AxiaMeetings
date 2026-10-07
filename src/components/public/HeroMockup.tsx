import React from 'react';
import { Home, Calendar, Users, Package, FileText, CheckCircle2, Clock, Shield } from 'lucide-react';

export function HeroMockup() {
  return (
    <div className="w-full h-auto bg-[#F0F5FA]  rounded-2xl md:rounded-[2rem] border border-slate-200  shadow-2xl overflow-hidden flex flex-col font-sans">
      {/* Top Header */}
      <div className="h-14 bg-white  flex items-center justify-between px-6 border-b border-slate-200  shrink-0">
        <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[#002B5B] flex items-center justify-center">
                <Shield className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-[#002B5B]  text-base">Axia Meetings</span>
        </div>
        <div className="flex items-center gap-4">
            <div className="h-8 w-8 rounded-full bg-slate-200  border-2 border-white  flex items-center justify-center text-xs font-bold text-[#002B5B] ">
                JD
            </div>
        </div>
      </div>

      <div className="flex flex-1 h-[400px] md:h-[500px]">
        {/* Sidebar */}
        <div className="w-16 md:w-56 bg-white  border-r border-slate-200  flex flex-col py-4 px-2 md:px-4 shrink-0">
          <div className="space-y-2">
            <div className="flex items-center gap-3 px-2 md:px-3 py-2 bg-blue-50  text-blue-600  rounded-lg">
                <Home className="w-5 h-5 shrink-0" />
                <span className="font-semibold text-sm hidden md:block">Overview</span>
            </div>
            <div className="flex items-center gap-3 px-2 md:px-3 py-2 text-slate-500 hover:bg-slate-50 :bg-slate-900 rounded-lg">
                <Calendar className="w-5 h-5 shrink-0" />
                <span className="font-semibold text-sm hidden md:block">Meetings</span>
            </div>
            <div className="flex items-center gap-3 px-2 md:px-3 py-2 text-slate-500 hover:bg-slate-50 :bg-slate-900 rounded-lg">
                <Users className="w-5 h-5 shrink-0" />
                <span className="font-semibold text-sm hidden md:block">Participants</span>
            </div>
            <div className="flex items-center gap-3 px-2 md:px-3 py-2 text-slate-500 hover:bg-slate-50 :bg-slate-900 rounded-lg">
                <Package className="w-5 h-5 shrink-0" />
                <span className="font-semibold text-sm hidden md:block">Packages</span>
            </div>
          </div>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 bg-slate-50  p-4 md:p-6 overflow-hidden flex flex-col gap-6">
            <div className="flex justify-between items-end">
                <div>
                    <h2 className="text-xl md:text-2xl font-bold text-slate-900 ">Welcome back, John</h2>
                    <p className="text-sm text-slate-500 ">Here's what's happening with your meetings today.</p>
                </div>
                <div className="hidden md:flex bg-[#002B5B] text-white px-4 py-2 rounded-lg text-sm font-semibold items-center gap-2">
                    <Calendar className="w-4 h-4" /> Schedule Meeting
                </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                    { label: "Total Meetings", value: "124", icon: Calendar, color: "text-blue-500", bg: "bg-blue-50" },
                    { label: "Active Participants", value: "852", icon: Users, color: "text-green-500", bg: "bg-green-50" },
                    { label: "Pending Requests", value: "12", icon: FileText, color: "text-amber-500", bg: "bg-amber-50" },
                    { label: "Avg Attendance", value: "94%", icon: CheckCircle2, color: "text-purple-500", bg: "bg-purple-50" },
                ].map((stat, i) => (
                    <div key={i} className="bg-white  p-4 rounded-xl border border-slate-200  shadow-sm flex flex-col gap-3">
                        <div className={`w-8 h-8 rounded-lg ${stat.bg}  flex items-center justify-center ${stat.color}`}>
                            <stat.icon className="w-4 h-4" />
                        </div>
                        <div>
                            <div className="text-2xl font-bold text-slate-900 ">{stat.value}</div>
                            <div className="text-xs text-slate-500 font-medium">{stat.label}</div>
                        </div>
                    </div>
                ))}
            </div>

            <div className="flex-1 bg-white  rounded-xl border border-slate-200  shadow-sm p-4 md:p-6 flex flex-col gap-4">
                <h3 className="font-bold text-slate-900  flex items-center gap-2">
                    <Clock className="w-4 h-4 text-slate-400" /> Upcoming Meetings
                </h3>
                <div className="flex-1 overflow-hidden flex flex-col gap-3">
                    {[
                        { title: "Q3 Board of Directors Review", time: "Today, 2:00 PM", status: "Scheduled", type: "Board" },
                        { title: "Executive Committee Align", time: "Tomorrow, 10:00 AM", status: "Scheduled", type: "Executive" },
                        { title: "Shareholders Annual Assembly", time: "Next Week, 9:00 AM", status: "Draft", type: "Assembly" },
                    ].map((meet, i) => (
                        <div key={i} className="flex items-center justify-between p-3 rounded-lg border border-slate-100  hover:bg-slate-50 :bg-slate-900/50 transition-colors">
                            <div className="flex flex-col gap-1">
                                <span className="font-semibold text-sm text-slate-900 ">{meet.title}</span>
                                <span className="text-xs text-slate-500">{meet.time}</span>
                            </div>
                            <div className="hidden md:flex items-center gap-2">
                                <span className="px-2 py-1 bg-slate-100  text-slate-600  rounded text-[10px] font-bold uppercase">{meet.type}</span>
                                <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase ${meet.status === 'Scheduled' ? 'bg-blue-50  text-blue-600 ' : 'bg-slate-100  text-slate-600 '}`}>
                                    {meet.status}
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
      </div>
    </div>
  );
}
