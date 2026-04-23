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
  FileText,
  Download,
  MessageSquare
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
  source?: 'admin' | 'mybatch';
}

export default function AttendanceModule({ user, isAdmin, isFaculty, facultyBatches, source = 'mybatch' }: AttendanceModuleProps) {
  const [activeTab, setActiveTab] = useState<'student' | 'faculty' | 'reports'>(
    source === 'admin' ? 'reports' : (isFaculty ? 'student' : 'student')
  );
  const [batches, setBatches] = useState<any[]>([]);
  const [selectedBatch, setSelectedBatch] = useState<any | null>(null);
  const [students, setStudents] = useState<any[]>([]);
  const [attendanceDate, setAttendanceDate] = useState(new Date().toISOString().split('T')[0]);
  const [attendanceRecords, setAttendanceRecords] = useState<Record<string, 'present' | 'absent'>>({});
  const [loading, setLoading] = useState(true);
  const [batchFacultyRecords, setBatchFacultyRecords] = useState<any[]>([]);
  const [facultyAttendance, setFacultyAttendance] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  const [studentAttendance, setStudentAttendance] = useState<any[]>([]);
  const [reportTab, setReportTab] = useState<'faculty' | 'student'>('student');
  const [messagingConfig, setMessagingConfig] = useState({ provider: 'whatsapp', apiKey: '', template: 'Hello {name}, your attendance is marked as {status} for {date}.' });
  const [showConfig, setShowConfig] = useState(false);
  const [allEnrollments, setAllEnrollments] = useState<any[]>([]);
  const [reportBatchFilter, setReportBatchFilter] = useState('ALL');
  const [selectedSubject, setSelectedSubject] = useState<string>('ALL');
  const [showSubmissionModal, setShowSubmissionModal] = useState(false);
  const [submissionDetails, setSubmissionDetails] = useState<any>(null);

  const facultyAssignedSubject = React.useMemo(() => {
    if (isAdmin || !isFaculty || !selectedBatch) return null;
    const fb = facultyBatches?.find(f => f.batchId === selectedBatch.id);
    return fb ? fb.subject : null;
  }, [isAdmin, isFaculty, selectedBatch, facultyBatches]);

  const kolkataNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  const todayDateStr = kolkataNow.toISOString().split('T')[0];
  const yesterdayDate = new Date(kolkataNow);
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterdayDateStr = yesterdayDate.toISOString().split('T')[0];

  const todayFaculty = facultyAttendance.filter(a => a.dateStr === todayDateStr && a.isApproved);
  const yesterdayFaculty = facultyAttendance.filter(a => a.dateStr === yesterdayDateStr && a.isApproved);

  useEffect(() => {
    if (facultyAssignedSubject && facultyAssignedSubject !== 'ALL') {
      setSelectedSubject(facultyAssignedSubject);
    } else {
      setSelectedSubject('ALL');
    }
  }, [facultyAssignedSubject, selectedBatch]);

  const getBatchGrade = (batch: any) => {
    if (batch.grade) return batch.grade;
    const match = `${batch.name} ${batch.tag || ''}`.match(/\b(XII|XI|X)\b/i);
    return match ? match[0].toUpperCase() : null;
  };

  const batchWiseReport = React.useMemo(() => {
    if (!isAdmin) return {};
    const report: Record<string, {
      batchName: string;
      subject: string;
      totalClasses: number;
      students: Record<string, { name: string; email: string; whatsapp: string; present: number; absent: number; }>;
    }> = {};

    studentAttendance.forEach(a => {
       const batchId = a.batchId;
       const subject = a.subject || 'Various Subjects';
       if (!batchId) return;
       const reportKey = `${batchId}_${subject}`;
       if (!report[reportKey]) {
          report[reportKey] = { batchName: a.batchName || 'Unknown Batch', subject: subject, totalClasses: 0, students: {} };
       }
       report[reportKey].totalClasses++;

       if (a.records) {
          Object.entries(a.records).forEach(([studentId, status]) => {
             if (!report[reportKey].students[studentId]) {
                const sData = allEnrollments.find(e => e.id === studentId);
                report[reportKey].students[studentId] = {
                   name: sData ? sData.name : 'Unknown Student',
                   email: sData ? sData.email : '',
                   whatsapp: sData ? sData.whatsapp : '',
                   present: 0,
                   absent: 0
                };
             }
             if (status === 'present') {
                report[reportKey].students[studentId].present++;
             } else if (status === 'absent') {
                report[reportKey].students[studentId].absent++;
             }
          });
       }
    });

    allEnrollments.filter(e => e.feeStatus !== 'Pending').forEach(student => {
       const studentBatches = batches.filter(b => {
          const bGrade = getBatchGrade(b);
          if (student.batchId) return student.batchId === b.id;
          if (bGrade && student.grade === bGrade) return true;
          return false;
       });

       studentBatches.forEach(b => {
          const subjectsToInject = student.subjects && student.subjects.length > 0 ? student.subjects : ['Various Subjects'];
          subjectsToInject.forEach((sub: string) => {
             const reportKey = `${b.id}_${sub}`;
             if (!report[reportKey]) {
                report[reportKey] = { batchName: b.name, subject: sub, totalClasses: 0, students: {} };
             }
             if (!report[reportKey].students[student.id]) {
                report[reportKey].students[student.id] = {
                   name: student.name || 'Unknown',
                   email: student.email || '',
                   whatsapp: student.whatsapp || '',
                   present: 0,
                   absent: 0
                };
             }
          });
       });
    });

    return report;
  }, [studentAttendance, allEnrollments, batches, isAdmin]);

  useEffect(() => {
    const unsubBatches = firestoreService.listenToCollection('batches', (data) => {
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

    let unsubStudentAttendance = () => {};
    let unsubEnrollments = () => {};
    if (isAdmin || isFaculty) {
      unsubStudentAttendance = firestoreService.listenToCollection('attendance', (data) => {
        setStudentAttendance(data.sort((a, b) => b.date?.seconds - a.date?.seconds));
      });
    }
    if (isAdmin) {
      unsubEnrollments = firestoreService.listenToCollection('enrollments', (data) => {
        setAllEnrollments(data);
      });
    }

    return () => {
      unsubBatches();
      unsubFacultyAttendance();
      unsubStudentAttendance();
      unsubEnrollments();
    };
  }, [isAdmin]);

  useEffect(() => {
    if (selectedBatch) {
      const fetchStudents = async () => {
        const batchGrade = getBatchGrade(selectedBatch);
        let q;
        if (batchGrade) {
           q = query(collection(db, 'enrollments'), where('grade', '==', batchGrade));
        } else {
           q = query(collection(db, 'enrollments'));
        }
        
        const snap = await getDocs(q);
        
        let fetchedStudents = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        // Filter out students not tied to this batch
        fetchedStudents = fetchedStudents.filter((s: any) => {
          if (s.batchId) return s.batchId === selectedBatch.id;
          if (batchGrade && s.grade === batchGrade) return true;
          return false;
        });

        // Fetch students whose explicit batchId matches, but may have a different grade
        if (batchGrade) {
           const explicitQ = query(collection(db, 'enrollments'), where('batchId', '==', selectedBatch.id));
           const explicitSnap = await getDocs(explicitQ);
           explicitSnap.docs.forEach(doc => {
              if (!fetchedStudents.some(s => s.id === doc.id)) {
                 fetchedStudents.push({ id: doc.id, ...doc.data() });
              }
           });
        }

        setStudents(fetchedStudents);
      };
      fetchStudents();
    }
  }, [selectedBatch]);

  const availableSubjects = React.useMemo(() => {
    if (facultyAssignedSubject && facultyAssignedSubject !== 'ALL') {
      return [facultyAssignedSubject];
    }
    const subs = new Set<string>();
    students.forEach((s: any) => {
      (s.subjects || []).forEach((sub: string) => subs.add(sub));
    });
    return Array.from(subs).sort();
  }, [students, facultyAssignedSubject]);

  // Mini calendar logic
  const recentDays = Array.from({length: 5}, (_, i) => {
    const d = new Date(kolkataNow);
    d.setDate(d.getDate() - (4 - i));
    return d.toISOString().split('T')[0];
  });
  
  const isDateCompleted = (dateStr: string) => {
    if (!selectedBatch) return false;
    return studentAttendance.some(a => 
      a.batchId === selectedBatch.id && 
      (selectedSubject === 'ALL' || a.subject === selectedSubject) && 
      a.date && new Date(a.date.seconds * 1000).toISOString().split('T')[0] === dateStr
    );
  };

  const visibleStudents = React.useMemo(() => {
    if (selectedSubject === 'ALL') return students;
    return students.filter((s: any) => s.subjects && s.subjects.includes(selectedSubject));
  }, [students, selectedSubject]);

  // Sync previous logs based on date
  useEffect(() => {
    let existingRecords: Record<string, 'present' | 'absent'> | null = null;
    
    if (selectedBatch && studentAttendance.length > 0) {
      const existingDoc = studentAttendance.find(a => 
        a.batchId === selectedBatch.id && 
        (selectedSubject === 'ALL' || a.subject === selectedSubject) && 
        a.date && new Date(a.date.seconds * 1000).toISOString().split('T')[0] === attendanceDate
      );
      if (existingDoc && existingDoc.records) {
        existingRecords = existingDoc.records;
      }
    }

    const defaultRecords: Record<string, 'present' | 'absent'> = {};
    visibleStudents.forEach((student: any) => {
      // Respect previously saved records from db if they exist for this specific date
      if (existingRecords && existingRecords[student.id]) {
        defaultRecords[student.id] = existingRecords[student.id];
      } else {
        defaultRecords[student.id] = 'present';
      }
    });

    setAttendanceRecords(defaultRecords);
  }, [visibleStudents, attendanceDate, selectedBatch, selectedSubject, studentAttendance]);

  const handleMarkAttendance = async () => {
    if (!selectedBatch) return;
    const toastId = toast.loading('Saving attendance...');
    try {
      const existingDoc = studentAttendance.find(a => 
        a.batchId === selectedBatch.id && 
        (selectedSubject === 'ALL' || a.subject === selectedSubject) && 
        a.date && new Date(a.date.seconds * 1000).toISOString().split('T')[0] === attendanceDate
      );

      const record = {
        batchId: selectedBatch.id,
        batchName: selectedBatch.name,
        subject: selectedSubject,
        date: Timestamp.fromDate(new Date(attendanceDate)),
        records: attendanceRecords,
        markedBy: user.email,
        markedAt: serverTimestamp()
      };

      if (existingDoc) {
        await updateDoc(doc(db, 'attendance', existingDoc.id), record);
      } else {
        await addDoc(collection(db, 'attendance'), record);
      }
      
      toast.success('Attendance saved successfully!', { id: toastId });
      
      const presentCount = Object.values(attendanceRecords).filter(v => v === 'present').length;
      setSubmissionDetails({
         batchName: selectedBatch.name,
         subject: selectedSubject,
         date: attendanceDate,
         presentCount,
         totalCount: visibleStudents.length
      });
      setShowSubmissionModal(true);
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
        
        <div className="flex gap-2 p-1 bg-white/5 rounded-2xl border border-white/5 overflow-x-auto custom-scrollbar-horizontal w-full">
          {(source === 'mybatch' || isAdmin) && (
            <button 
              onClick={() => setActiveTab('student')}
              className={`px-4 py-2 whitespace-nowrap rounded-xl text-xs font-bold transition-all ${activeTab === 'student' ? 'bg-[var(--primary)] text-white' : 'text-gray-500 hover:text-white'}`}
            >
              {isAdmin ? 'Edit Student Logs' : 'Take Student Attendance'}
            </button>
          )}
          {(source === 'mybatch' || isAdmin) && (
            <button 
              onClick={() => setActiveTab('faculty')}
              className={`px-4 py-2 whitespace-nowrap rounded-xl text-xs font-bold transition-all ${activeTab === 'faculty' ? 'bg-[var(--primary)] text-white' : 'text-gray-500 hover:text-white'}`}
            >
              {isAdmin ? 'Edit Faculty Logs' : 'My Attendance'}
            </button>
          )}
          {isAdmin && (
            <button 
              onClick={() => setActiveTab('reports')}
              className={`px-4 py-2 whitespace-nowrap rounded-xl text-xs font-bold transition-all ${activeTab === 'reports' ? 'bg-[var(--primary)] text-white' : 'text-gray-500 hover:text-white'}`}
            >
              Master Attendance Reports
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
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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
                <label className="text-[10px] font-black uppercase opacity-40">Select Subject</label>
                <select 
                  value={selectedSubject}
                  onChange={(e) => setSelectedSubject(e.target.value)}
                  disabled={!!(facultyAssignedSubject && facultyAssignedSubject !== 'ALL')}
                  className="w-full p-3 bg-white/5 border border-white/10 rounded-xl outline-none text-xs font-bold [&>option]:bg-gray-900"
                >
                  <option value="ALL">All Subjects</option>
                  {availableSubjects.map(sub => <option key={sub} value={sub}>{sub}</option>)}
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
                <div className="pt-2 flex justify-between gap-1">
                  {recentDays.map(d => {
                    const completed = isDateCompleted(d);
                    const isToday = d === todayDateStr;
                    const dateObj = new Date(d);
                    const dayString = dateObj.toLocaleDateString('en-US', { weekday: 'short' });
                    const isSelected = d === attendanceDate;
                    
                    return (
                      <button 
                        key={d} 
                        onClick={() => setAttendanceDate(d)}
                        className={`flex flex-col items-center p-1 rounded-lg border flex-1 transition-all ${
                          isSelected ? 'bg-white/20 border-white text-white' : 'border-transparent hover:bg-white/5 opacity-70'
                        }`}
                        title={`${d} ${completed ? '(Logged)' : '(Missing)'}`}
                      >
                        <span className="text-[8px] font-bold uppercase">{isToday ? 'TDY' : dayString.toUpperCase()}</span>
                        <div className={`w-2 h-2 rounded-full mt-1 ${completed ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]' : 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]'}`}></div>
                      </button>
                    )
                  })}
                </div>
              </div>
              <div className="glass-card p-4 flex flex-col justify-center items-center relative">
                <div className="absolute top-2 left-4">
                  <div className="text-xl font-black">{visibleStudents.length}</div>
                  <div className="text-[10px] opacity-40 uppercase font-black tracking-wider">Tgt Students</div>
                </div>
                <button 
                  onClick={handleMarkAttendance}
                  className="w-full mt-4 px-6 py-3 bg-green-500 text-white rounded-xl font-black text-xs shadow-lg shadow-green-500/20 hover:scale-105 transition-all"
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
                      visibleStudents.forEach((s: any) => all[s.id] = 'present');
                      setAttendanceRecords(all);
                    }}
                    className="text-[10px] font-black opacity-50 hover:opacity-100 uppercase bg-white/5 px-2 py-1 rounded"
                   >
                     All Present
                   </button>
                   <button 
                    onClick={() => setAttendanceRecords({})}
                    className="text-[10px] font-black opacity-50 hover:opacity-100 uppercase bg-white/5 px-2 py-1 rounded"
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
                      <th className="p-4 text-center">Enrollment Status</th>
                      <th className="p-4">Batch Info</th>
                      <th className="p-4 text-center w-48">Attendance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {visibleStudents.map((student: any) => (
                      <tr key={student.id} className="hover:bg-white/5 transition-colors">
                        <td className="p-4">
                          <div className="font-bold text-sm">{student.name}</div>
                          <div className="text-[10px] opacity-40">{student.email}</div>
                        </td>
                        <td className="p-4 text-center">
                          <span className={`px-2 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${student.feeStatus === 'Paid' ? 'bg-green-500/20 text-green-500' : 'bg-amber-500/20 text-amber-500'}`}>
                            {student.feeStatus === 'Paid' ? 'Verified / Paid' : student.feeStatus || 'Pending'}
                          </span>
                        </td>
                        <td className="p-4 text-xs opacity-60">
                          {student.grade} • {student.batchName}
                          <div className="text-[9px] mt-1 text-indigo-400 font-bold">{(student.subjects || []).join(', ')}</div>
                        </td>
                        <td className="p-4">
                          <div className="flex p-1 bg-white/5 rounded-xl border border-white/10">
                            <button 
                              onClick={() => setAttendanceRecords({...attendanceRecords, [student.id]: 'present'})}
                              className={`flex-1 py-1.5 rounded-lg flex items-center justify-center gap-1 text-[10px] font-black transition-all ${attendanceRecords[student.id] === 'present' ? 'bg-green-500 text-white shadow-lg' : 'opacity-40'}`}
                            >
                              <UserCheck size={12} /> P
                            </button>
                            <button 
                              onClick={() => setAttendanceRecords({...attendanceRecords, [student.id]: 'absent'})}
                              className={`flex-1 py-1.5 rounded-lg flex items-center justify-center gap-1 text-[10px] font-black transition-all ${attendanceRecords[student.id] === 'absent' ? 'bg-red-500 text-white shadow-lg' : 'opacity-40'}`}
                            >
                              <UserX size={12} /> A
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {visibleStudents.length === 0 && (
                      <tr><td colSpan={4} className="p-8 text-center text-sm opacity-50 italic">No students found for this selection.</td></tr>
                    )}
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
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div className="flex gap-2 p-1 bg-white/5 rounded-2xl border border-white/5 w-full sm:w-auto">
                <button 
                  onClick={() => setReportTab('student')}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex-1 sm:flex-none ${reportTab === 'student' ? 'bg-[var(--primary)] text-white' : 'text-gray-500 hover:text-white'}`}
                >
                  Student Reports
                </button>
                <button 
                  onClick={() => setReportTab('faculty')}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex-1 sm:flex-none ${reportTab === 'faculty' ? 'bg-[var(--primary)] text-white' : 'text-gray-500 hover:text-white'}`}
                >
                  Faculty Reports
                </button>
              </div>
              <div className="flex gap-2 w-full sm:w-auto">
                <button 
                  onClick={() => setShowConfig(!showConfig)}
                  className="px-4 py-2 bg-indigo-500/10 text-indigo-500 rounded-xl text-xs font-bold transition-all hover:bg-indigo-500 hover:text-white flex items-center justify-center gap-2 flex-1 sm:flex-none"
                >
                  <MessageSquare size={14} /> SMS / WA API
                </button>
                <button 
                  onClick={() => {
                    if (reportTab === 'student') {
                      let csv = 'Batch,Subject,Student Name,Email,Total Classes,Present,Absent,Percentage\n';
                      let hasData = false;
                      Object.values(batchWiseReport).forEach(batch => {
                        Object.entries(batch.students).forEach(([id, s]) => {
                          hasData = true;
                          const total = s.present + s.absent;
                          const pct = total > 0 ? Math.round((s.present/total)*100) : 0;
                          csv += `"${batch.batchName}","${batch.subject}","${s.name}","${s.email}",${batch.totalClasses},${s.present},${s.absent},${pct}%\n`;
                        });
                      });
                      if (!hasData) return toast.error('No data to export');
                      const blob = new Blob([csv], { type: 'text/csv' });
                      const url = window.URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `student_attendance_${new Date().toISOString().split('T')[0]}.csv`;
                      a.click();
                    } else {
                      const dataToExport = facultyAttendance;
                      if (dataToExport.length === 0) return toast.error('No data to export');
                      let csv = 'Date,Faculty Name,Email,Status,Disapproval Reason\n' + dataToExport.map(r => `${r.dateStr},${r.userName},${r.userEmail},${r.isApproved ? 'Approved' : 'Disapproved'},${r.disapprovalReason || ''}`).join('\n');
                      const blob = new Blob([csv], { type: 'text/csv' });
                      const url = window.URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `faculty_attendance_${new Date().toISOString().split('T')[0]}.csv`;
                      a.click();
                    }
                  }}
                  className="px-4 py-2 bg-[var(--primary)] text-white rounded-xl text-xs font-bold hover:scale-105 transition-all flex items-center justify-center gap-2 flex-1 sm:flex-none"
                >
                  <Download size={14} /> Download CSV
                </button>
              </div>
            </div>

            <AnimatePresence>
              {showConfig && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                  <div className="glass-card p-6 border-l-4 border-indigo-500 space-y-4">
                    <h3 className="font-bold flex items-center gap-2 text-indigo-500"><MessageSquare size={16} /> Automated Messaging Configuration</h3>
                    <p className="text-xs opacity-70">Configure logic to automatically send SMS or WhatsApp templates sequentially when attendance is logged.</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase opacity-40">Provider</label>
                        <select className="w-full p-3 rounded-xl bg-white/5 border border-white/10 outline-none text-sm [&>option]:bg-gray-900" value={messagingConfig.provider} onChange={e => setMessagingConfig({...messagingConfig, provider: e.target.value})}>
                          <option value="whatsapp">WhatsApp (Business API)</option>
                          <option value="twilio">Twilio SMS</option>
                          <option value="msg91">MSG91</option>
                        </select>
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase opacity-40">API Key / Token</label>
                        <input type="password" placeholder="Enter API Key" className="w-full p-3 rounded-xl bg-white/5 border border-white/10 outline-none text-sm focus:border-indigo-500" value={messagingConfig.apiKey} onChange={e => setMessagingConfig({...messagingConfig, apiKey: e.target.value})} />
                      </div>
                      <div className="md:col-span-2 space-y-2">
                        <label className="text-[10px] font-black uppercase opacity-40">Message Template</label>
                        <textarea rows={2} className="w-full p-3 rounded-xl bg-white/5 border border-white/10 outline-none text-sm focus:border-indigo-500" value={messagingConfig.template} onChange={e => setMessagingConfig({...messagingConfig, template: e.target.value})} />
                        <div className="text-[10px] opacity-50 font-mono">Available variables: {'{name}, {status}, {date}, {batch}'}</div>
                      </div>
                    </div>
                    <div className="flex justify-end">
                      <button onClick={() => { setShowConfig(false); toast.success('Messaging config saved locally (Preview)'); }} className="px-6 py-2 bg-indigo-500 text-white rounded-xl font-bold text-xs">Save Configuration</button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {reportTab === 'faculty' && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                   <div className="glass-card p-6 border-l-4 border-emerald-500">
                      <h4 className="text-xs font-black opacity-50 uppercase tracking-widest mb-4">Today's Present Faculties</h4>
                      <div className="text-4xl font-black text-emerald-500 mb-2">{todayFaculty.length}</div>
                      <div className="space-y-2">
                        {todayFaculty.map(f => (
                           <div key={`today-${f.id}`} className="text-xs flex justify-between bg-white/5 p-2 rounded">
                             <span className="font-bold">{f.userName}</span>
                             <span className="opacity-50">{new Date(f.date?.seconds * 1000).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                           </div>
                        ))}
                        {todayFaculty.length === 0 && <p className="text-xs opacity-40 italic">Nobody signed in yet.</p>}
                      </div>
                   </div>
                   <div className="glass-card p-6 border-l-4 border-blue-500">
                      <h4 className="text-xs font-black opacity-50 uppercase tracking-widest mb-4">Yesterday's Present Faculties</h4>
                      <div className="text-4xl font-black text-blue-500 mb-2">{yesterdayFaculty.length}</div>
                      <div className="space-y-2">
                        {yesterdayFaculty.map(f => (
                           <div key={`yest-${f.id}`} className="text-xs flex justify-between bg-white/5 p-2 rounded">
                             <span className="font-bold">{f.userName}</span>
                             <span className="opacity-50">{new Date(f.date?.seconds * 1000).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                           </div>
                        ))}
                        {yesterdayFaculty.length === 0 && <p className="text-xs opacity-40 italic">Nobody signed in.</p>}
                      </div>
                   </div>
                </div>

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
                                  className="px-3 py-1 bg-red-500/10 text-red-500 rounded-lg text-[10px] font-black hover:bg-red-500/20 transition-all mr-2"
                                >
                                  DISAPPROVE
                                </button>
                              ) : (
                                <button 
                                  onClick={() => {
                                    updateDoc(doc(db, 'faculty_attendance', a.id), { isApproved: true, disapprovalReason: null });
                                  }}
                                  className="px-3 py-1 bg-green-500/10 text-green-500 rounded-lg text-[10px] font-black hover:bg-green-500/20 transition-all mr-2"
                                >
                                  APPROVE
                                </button>
                              )}
                              <button 
                                onClick={() => {
                                  if(window.confirm('Delete this record entirely?')) {
                                     firestoreService.deleteItem('faculty_attendance', a.id);
                                  }
                                }}
                                className="px-3 py-1 bg-red-500/10 text-red-500 rounded-lg text-[10px] font-black hover:bg-red-500/20 transition-all"
                              >
                                DELETE
                              </button>
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
              </div>
            )}

            {reportTab === 'student' && (
              <div className="glass-card p-6 border-l-4 border-[var(--primary)] space-y-6">
                 <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                   <h3 className="text-lg font-bold flex items-center gap-2">
                     <Users size={20} /> Batch-Wise Student Attendance
                   </h3>
                   <select 
                     value={reportBatchFilter}
                     onChange={(e) => setReportBatchFilter(e.target.value)}
                     className="p-2 bg-white/5 border border-white/10 rounded-xl outline-none text-sm font-bold [&>option]:bg-gray-900"
                   >
                     <option value="ALL">All Batch Groups</option>
                     {Object.entries(batchWiseReport)
                       .sort((a, b) => a[1].batchName.localeCompare(b[1].batchName) || a[1].subject.localeCompare(b[1].subject))
                       .map(([key, data]) => (
                       <option key={key} value={key}>
                         {data.batchName} {data.subject !== 'ALL' && data.subject !== 'Various Subjects' ? `- ${data.subject}` : ''}
                       </option>
                     ))}
                   </select>
                 </div>
                 
                 <div className="space-y-8">
                   {Object.entries(batchWiseReport)
                     .filter(([key]) => reportBatchFilter === 'ALL' || key === reportBatchFilter)
                     .sort((a, b) => a[1].batchName.localeCompare(b[1].batchName) || a[1].subject.localeCompare(b[1].subject))
                     .map(([key, batchData]) => (
                     <div key={key} className="space-y-4">
                       <div className="flex justify-between items-end border-b border-white/10 pb-2">
                         <div>
                           <div className="flex items-center gap-3">
                             <h4 className="font-black text-[var(--primary)] text-lg">{batchData.batchName}</h4>
                             {batchData.subject !== 'ALL' && batchData.subject !== 'Various Subjects' && (
                               <span className="px-2 py-0.5 bg-indigo-500/20 text-indigo-400 rounded text-xs font-black uppercase tracking-widest">{batchData.subject}</span>
                             )}
                           </div>
                           <div className="text-xs opacity-60 font-bold uppercase tracking-wider">{batchData.totalClasses} Total Classes Recorded</div>
                         </div>
                       </div>
                       <div className="overflow-x-auto">
                         <table className="w-full text-left">
                           <thead className="text-[10px] font-black uppercase opacity-40 bg-white/5">
                             <tr>
                               <th className="p-3">Student</th>
                               <th className="p-3 text-center">Present</th>
                               <th className="p-3 text-center">Absent</th>
                               <th className="p-3 text-center">Percentage</th>
                               <th className="p-3 text-center">Actions</th>
                             </tr>
                           </thead>
                           <tbody className="divide-y divide-white/5 text-sm">
                             {Object.entries(batchData.students).map(([studentId, s]) => {
                               const total = s.present + s.absent;
                               const percent = total > 0 ? Math.round((s.present / total) * 100) : 0;
                               return (
                                 <tr key={studentId} className="hover:bg-white/5 transition-colors">
                                   <td className="p-3">
                                     <div className="font-bold">{s.name}</div>
                                     <div className="text-[10px] opacity-40">{s.email || studentId}</div>
                                   </td>
                                   <td className="p-3 text-center font-black text-green-500">{s.present}</td>
                                   <td className="p-3 text-center font-black text-red-500">{s.absent}</td>
                                   <td className="p-3 text-center">
                                     <span className={`px-2 py-1 rounded-full text-[10px] font-black ${percent >= 75 ? 'bg-green-500/20 text-green-500' : percent >= 50 ? 'bg-amber-500/20 text-amber-500' : 'bg-red-500/20 text-red-500'}`}>
                                       {percent}%
                                     </span>
                                   </td>
                                   <td className="p-3 text-center">
                                     <a 
                                       href={`https://wa.me/${s.whatsapp}?text=${encodeURIComponent(messagingConfig.template.replace('{name}', s.name).replace('{status}', 'checked').replace('{date}', new Date().toLocaleDateString()).replace('{batch}', batchData.batchName))}`}
                                       target="_blank" rel="noopener noreferrer"
                                       className="inline-flex items-center justify-center p-2 bg-green-500/10 text-green-500 rounded-lg hover:bg-green-500/20 transition-all"
                                       title="Message on WhatsApp"
                                     >
                                       <MessageSquare size={14} />
                                     </a>
                                   </td>
                                 </tr>
                               );
                             })}
                             {Object.keys(batchData.students).length === 0 && (
                               <tr><td colSpan={5} className="p-8 text-center opacity-40 italic">No students enrolled in this batch.</td></tr>
                             )}
                           </tbody>
                         </table>
                       </div>
                     </div>
                   ))}
                   
                   {Object.keys(batchWiseReport).length === 0 && (
                     <div className="p-10 text-center opacity-40 italic font-bold">No batches available.</div>
                   )}
                 </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showSubmissionModal && submissionDetails && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="bg-gray-900 border border-white/10 p-8 rounded-3xl shadow-2xl max-w-sm w-full relative overflow-hidden"
            >
              <div className="absolute top-0 left-0 w-full h-2 bg-green-500"></div>
              <div className="flex flex-col items-center text-center space-y-4">
                <div className="w-16 h-16 bg-green-500/10 rounded-full flex items-center justify-center">
                  <CheckCircle2 size={32} className="text-green-500" />
                </div>
                <div>
                  <h3 className="text-2xl font-black mb-1">Attendance Logged</h3>
                  <p className="text-sm opacity-60">Successfully saved to the cloud.</p>
                </div>
                
                <div className="w-full bg-white/5 rounded-xl p-4 space-y-2 text-left">
                  <div className="flex justify-between items-center text-sm">
                    <span className="opacity-50 font-bold uppercase text-[10px]">Date</span>
                    <span className="font-bold">{submissionDetails.date}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="opacity-50 font-bold uppercase text-[10px]">Class</span>
                    <span className="font-bold">{submissionDetails.batchName}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="opacity-50 font-bold uppercase text-[10px]">Subject</span>
                    <span className="font-bold text-indigo-400">{submissionDetails.subject}</span>
                  </div>
                  <div className="pt-2 mt-2 border-t border-white/10 flex justify-between items-center">
                    <span className="opacity-50 font-bold uppercase text-[10px]">Students Present</span>
                    <span className="font-black text-green-500 text-lg">{submissionDetails.presentCount} <span className="text-sm opacity-50 font-medium">/ {submissionDetails.totalCount}</span></span>
                  </div>
                </div>

                <button 
                  onClick={() => setShowSubmissionModal(false)}
                  className="w-full py-3 bg-[var(--primary)] hover:bg-[var(--primary)]/90 text-white rounded-xl font-bold transition-all mt-4"
                >
                  Done
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
