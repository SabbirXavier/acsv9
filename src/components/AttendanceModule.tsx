import React, { useState, useEffect } from 'react';
import { 
  CheckCircle2, 
  XCircle, 
  Calendar, 
  Users, 
  UserCheck, 
  UserX, 
  Clock, 
  Search,
  ChevronRight,
  Filter,
  AlertCircle,
  FileText
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { firestoreService } from '../services/firestoreService';
import { db } from '../firebase';
import { collection, query, where, getDocs, Timestamp, addDoc, updateDoc, doc, onSnapshot, serverTimestamp } from 'firebase/firestore';
import toast from 'react-hot-toast';

interface AttendanceModuleProps {
  user: any;
  isAdmin: boolean;
  isFaculty: boolean;
  facultyBatches: any[];
}

export default function AttendanceModule({ user, isAdmin, isFaculty, facultyBatches }: AttendanceModuleProps) {
  const [activeTab, setActiveTab] = useState<'student' | 'faculty' | 'reports'>(isAdmin ? 'reports' : (isFaculty ? 'student' : 'student'));
  const [batches, setBatches] = useState<any[]>([]);
  const [selectedBatch, setSelectedBatch] = useState<any | null>(null);
  const [students, setStudents] = useState<any[]>([]);
  const [attendanceDate, setAttendanceDate] = useState(new Date().toISOString().split('T')[0]);
  const [attendanceRecords, setAttendanceRecords] = useState<Record<string, 'present' | 'absent'>>({});
  const [loading, setLoading] = useState(true);
  const [batchFacultyRecords, setBatchFacultyRecords] = useState<any[]>([]);
  const [facultyAttendance, setFacultyAttendance] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    const unsubBatches = firestoreService.listenToCollection('batches', (data) => {
      // If faculty and not admin, filter batches to only those they are assigned to
      const filteredBatches = (isFaculty && !isAdmin) 
        ? data.filter(b => facultyBatches.some(fb => fb.batchId === b.id))
        : data;
      
      setBatches(filteredBatches);
      
      if (filteredBatches.length > 0 && !selectedBatch) {
        setSelectedBatch(filteredBatches[0]);
      }
      setLoading(false);
    });

    const unsubFacultyAttendance = firestoreService.listenToCollection('faculty_attendance', (data) => {
      setFacultyAttendance(data.sort((a, b) => b.date?.seconds - a.date?.seconds));
    });

    return () => {
      unsubBatches();
      unsubFacultyAttendance();
    };
  }, []);

  useEffect(() => {
    if (selectedBatch) {
      const fetchStudents = async () => {
        const q = query(collection(db, 'enrollments'), where('grade', '==', selectedBatch.grade), where('feeStatus', '==', 'Paid'));
        const snap = await getDocs(q);
        setStudents(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      };
      fetchStudents();
    }
  }, [selectedBatch]);

  const handleMarkAttendance = async () => {
    if (!selectedBatch) return;
    const toastId = toast.loading('Saving attendance...');
    try {
      const record = {
        batchId: selectedBatch.id,
        batchName: selectedBatch.name,
        date: Timestamp.fromDate(new Date(attendanceDate)),
        records: attendanceRecords,
        markedBy: user.email,
        markedAt: serverTimestamp()
      };
      await addDoc(collection(db, 'attendance'), record);
      toast.success('Attendance saved successfully!', { id: toastId });
    } catch (err) {
      toast.error('Failed to save attendance', { id: toastId });
    }
  };

  const markFacultyAttendance = async () => {
    const toastId = toast.loading('Marking present...');
    try {
      const today = new Date().toISOString().split('T')[0];
      const existing = facultyAttendance.find(a => a.userId === user.uid && a.dateStr === today);
      if (existing) {
        toast.error('Attendance already marked for today', { id: toastId });
        return;
      }

      await addDoc(collection(db, 'faculty_attendance'), {
        userId: user.uid,
        userName: user.displayName || user.email,
        userEmail: user.email,
        date: serverTimestamp(),
        dateStr: today,
        status: 'present',
        isApproved: true // Default true, admin can disapprove
      });
      toast.success('Present marked for today!', { id: toastId });
    } catch (err) {
      toast.error('Failed to mark attendance', { id: toastId });
    }
  };

  const disapproveAttendance = async (id: string, reason: string) => {
    try {
      await updateDoc(doc(db, 'faculty_attendance', id), {
        isApproved: false,
        disapprovalReason: reason,
        disapprovedAt: serverTimestamp(),
        disapprovedBy: user.email
      });
      toast.success('Attendance disapproved');
    } catch (err) {
      toast.error('Action failed');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2 italic">
            <UserCheck className="text-[var(--primary)]" />
            ATTENDANCE SYSTEM
          </h2>
          <p className="text-sm opacity-60">Manage student and faculty presence</p>
        </div>
        
        <div className="flex gap-2 p-1 bg-white/5 rounded-2xl border border-white/5">
          <button 
            onClick={() => setActiveTab('student')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${activeTab === 'student' ? 'bg-[var(--primary)] text-white' : 'text-gray-500 hover:text-white'}`}
          >
            Take Student Attendance
          </button>
          <button 
            onClick={() => setActiveTab('faculty')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${activeTab === 'faculty' ? 'bg-[var(--primary)] text-white' : 'text-gray-500 hover:text-white'}`}
          >
            My Attendance
          </button>
          {isAdmin && (
            <button 
              onClick={() => setActiveTab('reports')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${activeTab === 'reports' ? 'bg-[var(--primary)] text-white' : 'text-gray-500 hover:text-white'}`}
            >
              Master Report
            </button>
          )}
        </div>
      </div>

      <AnimatePresence mode="wait">
        {activeTab === 'student' && (
          <motion.div 
            key="student"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-4"
          >
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="glass-card p-4 space-y-2">
                <label className="text-[10px] font-black uppercase opacity-40">Select Batch</label>
                <select 
                  value={selectedBatch?.id}
                  onChange={(e) => setSelectedBatch(batches.find(b => b.id === e.target.value))}
                  className="w-full p-3 bg-white/5 border border-white/10 rounded-xl outline-none text-xs font-bold [&>option]:bg-gray-900"
                >
                  {batches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
              <div className="glass-card p-4 space-y-2">
                <label className="text-[10px] font-black uppercase opacity-40">Attendance Date</label>
                <input 
                  type="date" 
                  value={attendanceDate}
                  onChange={(e) => setAttendanceDate(e.target.value)}
                  className="w-full p-3 bg-white/5 border border-white/10 rounded-xl outline-none text-xs font-bold"
                />
              </div>
              <div className="glass-card p-4 flex items-center justify-between">
                <div>
                  <div className="text-xl font-black">{students.length}</div>
                  <div className="text-[10px] opacity-40 uppercase font-black">Students to Mark</div>
                </div>
                <button 
                  onClick={handleMarkAttendance}
                  className="px-6 py-3 bg-green-500 text-white rounded-xl font-black text-xs shadow-lg shadow-green-500/20 hover:scale-105 transition-all"
                >
                  SAVE ALL
                </button>
              </div>
            </div>

            <div className="glass-card overflow-hidden">
              <div className="p-4 border-b border-white/5 flex justify-between items-center">
                <h4 className="font-bold flex items-center gap-2 text-sm italic">
                  <Users size={16} /> Mark Attendance Sheet
                </h4>
                <div className="flex gap-2">
                   <button 
                    onClick={() => {
                      const all: any = {};
                      students.forEach(s => all[s.id] = 'present');
                      setAttendanceRecords(all);
                    }}
                    className="text-[10px] font-black opacity-50 hover:opacity-100 uppercase"
                   >
                     All Present
                   </button>
                   <button 
                    onClick={() => setAttendanceRecords({})}
                    className="text-[10px] font-black opacity-50 hover:opacity-100 uppercase"
                   >
                     Clear
                   </button>
                </div>
              </div>
              <div className="max-h-[600px] overflow-y-auto custom-scrollbar">
                <table className="w-full text-left">
                  <thead className="bg-white/5 text-[10px] font-black uppercase opacity-40">
                    <tr>
                      <th className="p-4">Student</th>
                      <th className="p-4">Batch Info</th>
                      <th className="p-4 text-center w-48">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {students.map(student => (
                      <tr key={student.id} className="hover:bg-white/5 transition-colors">
                        <td className="p-4">
                          <div className="font-bold text-sm">{student.name}</div>
                          <div className="text-[10px] opacity-40">{student.email}</div>
                        </td>
                        <td className="p-4 text-xs opacity-60">
                          {student.grade} • {student.batchName}
                        </td>
                        <td className="p-4">
                          <div className="flex p-1 bg-white/5 rounded-xl border border-white/10">
                            <button 
                              onClick={() => setAttendanceRecords({...attendanceRecords, [student.id]: 'present'})}
                              className={`flex-1 py-1.5 rounded-lg flex items-center justify-center gap-1 text-[10px] font-black transition-all ${attendanceRecords[student.id] === 'present' ? 'bg-green-500 text-white shadow-lg' : 'opacity-40'}`}
                            >
                              <UserCheck size={12} /> PRESENT
                            </button>
                            <button 
                              onClick={() => setAttendanceRecords({...attendanceRecords, [student.id]: 'absent'})}
                              className={`flex-1 py-1.5 rounded-lg flex items-center justify-center gap-1 text-[10px] font-black transition-all ${attendanceRecords[student.id] === 'absent' ? 'bg-red-500 text-white shadow-lg' : 'opacity-40'}`}
                            >
                              <UserX size={12} /> ABSENT
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </motion.div>
        )}

        {activeTab === 'faculty' && (
          <motion.div 
            key="faculty"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            className="space-y-6"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="glass-card p-8 flex flex-col items-center justify-center text-center space-y-4">
                <div className="w-20 h-20 rounded-full bg-[var(--primary)]/10 text-[var(--primary)] flex items-center justify-center animate-pulse">
                  <Calendar size={40} />
                </div>
                <div>
                  <h3 className="text-2xl font-black italic">MARK TODAY</h3>
                  <p className="text-sm opacity-60">Session Date: {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
                </div>
                <button 
                  onClick={markFacultyAttendance}
                  className="w-full max-w-xs py-4 bg-[var(--primary)] text-white rounded-2xl font-black italic tracking-widest shadow-xl shadow-[var(--primary)]/20 hover:scale-105 active:scale-95 transition-all"
                >
                  I AM PRESENT
                </button>
              </div>

              <div className="glass-card p-6">
                <h4 className="text-sm font-black opacity-40 uppercase tracking-widest mb-6">Attendance Stats</h4>
                <div className="grid grid-cols-2 gap-4">
                   <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-2xl">
                      <div className="text-3xl font-black text-green-500">
                        {facultyAttendance.filter(a => a.userId === user.uid && a.isApproved).length}
                      </div>
                      <div className="text-[10px] font-bold opacity-60 uppercase">Working Days</div>
                   </div>
                   <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl">
                      <div className="text-3xl font-black text-red-500">
                        {facultyAttendance.filter(a => a.userId === user.uid && !a.isApproved).length}
                      </div>
                      <div className="text-[10px] font-bold opacity-60 uppercase">Disallowed</div>
                   </div>
                </div>
                <div className="mt-6 space-y-3">
                  <div className="text-[10px] font-black opacity-30 uppercase tracking-widest pl-1">Recent Activity</div>
                  {facultyAttendance.filter(a => a.userId === user.uid).slice(0, 3).map(a => (
                    <div key={a.id} className="flex justify-between items-center p-3 bg-white/5 rounded-xl text-xs">
                      <span className="font-bold">{a.dateStr}</span>
                      <span className={`px-2 py-0.5 rounded font-black text-[8px] uppercase ${a.isApproved ? 'bg-green-500/20 text-green-500' : 'bg-red-500/20 text-red-500'}`}>
                        {a.isApproved ? 'Approved' : 'Disapproved'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="glass-card overflow-hidden">
               <div className="p-4 border-b border-white/5 bg-white/5 font-bold italic">MY FULL ATTENDANCE LOG</div>
               <div className="overflow-x-auto">
                 <table className="w-full text-left">
                   <thead className="bg-white/5 text-[10px] font-black uppercase opacity-40">
                     <tr>
                       <th className="p-4">Date</th>
                       <th className="p-4">Status</th>
                       <th className="p-4">Admin Check</th>
                       <th className="p-4">Note / Reason</th>
                     </tr>
                   </thead>
                   <tbody className="divide-y divide-white/5 text-xs">
                      {facultyAttendance.filter(a => a.userId === user.uid).map(a => (
                        <tr key={a.id}>
                          <td className="p-4 font-bold">{a.dateStr}</td>
                          <td className="p-4"><span className="text-green-500 font-black">PRESENT</span></td>
                          <td className="p-4">
                            {a.isApproved ? (
                              <span className="flex items-center gap-1 text-green-500"><CheckCircle2 size={12}/> OK</span>
                            ) : (
                              <span className="flex items-center gap-1 text-red-500"><XCircle size={12}/> DISAPPROVED</span>
                            )}
                          </td>
                          <td className="p-4 italic opacity-60">
                            {!a.isApproved ? a.disapprovalReason : 'Valid Entry'}
                          </td>
                        </tr>
                      ))}
                   </tbody>
                 </table>
               </div>
            </div>
          </motion.div>
        )}

        {activeTab === 'reports' && isAdmin && (
          <motion.div 
            key="reports"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="space-y-6"
          >
            <div className="glass-card p-6 border-l-4 border-amber-500">
               <h3 className="text-lg font-bold flex items-center gap-2 text-amber-500 mb-4">
                 <AlertCircle size={20} /> Faculty Attendance Moderation
               </h3>
               <div className="overflow-x-auto">
                 <table className="w-full text-left">
                   <thead className="text-[10px] font-black uppercase opacity-40">
                     <tr>
                       <th className="p-4">Faculty</th>
                       <th className="p-4">Date</th>
                       <th className="p-4">Current Status</th>
                       <th className="p-4 text-right">Actions</th>
                     </tr>
                   </thead>
                   <tbody className="divide-y divide-white/5 text-sm">
                      {facultyAttendance.map(a => (
                        <tr key={a.id} className="hover:bg-white/5">
                          <td className="p-4">
                            <div className="font-bold">{a.userName}</div>
                            <div className="text-[10px] opacity-40">{a.userEmail}</div>
                          </td>
                          <td className="p-4 font-mono">{a.dateStr}</td>
                          <td className="p-4">
                            <span className={`px-2 py-1 rounded-full text-[10px] font-black uppercase ${a.isApproved ? 'bg-green-500/20 text-green-500' : 'bg-red-500/20 text-red-500'}`}>
                              {a.isApproved ? 'Approved' : 'Disapproved'}
                            </span>
                          </td>
                          <td className="p-4 text-right">
                            {a.isApproved ? (
                              <button 
                                onClick={() => {
                                  const reason = prompt('Enter reason for disapproval:');
                                  if (reason) disapproveAttendance(a.id, reason);
                                }}
                                className="px-3 py-1 bg-red-500/10 text-red-500 rounded-lg text-[10px] font-black hover:bg-red-500/20 transition-all"
                              >
                                DISAPPROVE
                              </button>
                            ) : (
                               <button 
                                onClick={() => updateDoc(doc(db, 'faculty_attendance', a.id), { isApproved: true, disapprovalReason: null })}
                                className="px-3 py-1 bg-green-500/10 text-green-500 rounded-lg text-[10px] font-black hover:bg-green-500/20 transition-all"
                              >
                                APPROVE
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                      {facultyAttendance.length === 0 && (
                        <tr><td colSpan={4} className="p-10 text-center opacity-40 italic">No attendance records found yet.</td></tr>
                      )}
                   </tbody>
                 </table>
               </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
