import React, { useState, useEffect, useMemo } from 'react';
import { 
  Wallet, 
  Settings, 
  History, 
  Plus, 
  TrendingUp, 
  CreditCard, 
  ExternalLink, 
  Trash2, 
  Edit2, 
  CheckCircle2, 
  AlertCircle,
  FileText,
  User,
  Search,
  ChevronRight,
  TrendingDown,
  Upload,
  ArrowRight
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { firestoreService } from '../services/firestoreService';
import { db } from '../firebase';
import { collection, query, where, getDocs, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, setDoc, onSnapshot, Timestamp } from 'firebase/firestore';
import toast from 'react-hot-toast';

interface SalaryModuleProps {
  user: any;
  isAdmin: boolean;
  isFaculty: boolean;
  facultyBatches: any[];
}

export default function SalaryModule({ user, isAdmin, isFaculty, facultyBatches }: SalaryModuleProps) {
  const [activeTab, setActiveTab] = useState<'overview' | 'settings' | 'payouts' | 'student-payments'>(isAdmin ? 'settings' : 'overview');
  const [facultyList, setFacultyList] = useState<any[]>([]);
  const [facultySalaries, setFacultySalaries] = useState<any[]>([]);
  const [payouts, setPayouts] = useState<any[]>([]);
  const [attendance, setAttendance] = useState<any[]>([]);
  const [enrollments, setEnrollments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Faculty specific state
  const [mySalaryInfo, setMySalaryInfo] = useState<any>(null);
  const [isResigning, setIsResigning] = useState(false);
  const [resignationDate, setResignationDate] = useState('');
  const [isRequestingPayout, setIsRequestingPayout] = useState(false);

  useEffect(() => {
    const unsubSalaries = firestoreService.listenToCollection('faculty_salaries', (data) => {
      setFacultySalaries(data);
      if (isFaculty) {
        setMySalaryInfo(data.find(s => s.userId === user.uid));
      }
    });

    const unsubPayouts = firestoreService.listenToCollection('payouts', (data) => {
      setPayouts(data.sort((a, b) => (b.date?.seconds || 0) - (a.date?.seconds || 0)));
    });

    const unsubAttendance = firestoreService.listenToCollection('faculty_attendance', (data) => {
      setAttendance(data);
    });

    const unsubEnrollments = firestoreService.listenToCollection('enrollments', (data) => {
      setEnrollments(data);
    });

    if (isAdmin) {
      const fetchFaculty = async () => {
         const q = query(collection(db, 'users'), where('roles', 'array-contains', 'faculty'));
         const snap = await getDocs(q);
         setFacultyList(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
         setLoading(false);
      };
      fetchFaculty();
    } else {
      setLoading(false);
    }

    return () => {
      unsubSalaries();
      unsubPayouts();
      unsubAttendance();
      unsubEnrollments();
    };
  }, [user.uid, isAdmin, isFaculty]);

  const calculateNetReceivable = (salaryInfo: any, currentAttendance: any[]) => {
    if (!salaryInfo) return 0;
    
    // Filter approved attendance for this month
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}`;
    const monthApproved = currentAttendance.filter(a => 
      a.userId === salaryInfo.userId && 
      a.dateStr.startsWith(currentMonth) && 
      a.isApproved
    );

    const workingDays = monthApproved.length;
    
    if (salaryInfo.model === 'monthly') {
      const fixedSalary = parseFloat(salaryInfo.baseAmount || 0);
      const totalDaysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      const dailyRate = fixedSalary / totalDaysInMonth;
      return workingDays * dailyRate;
    } else if (salaryInfo.model === 'daily') {
      return workingDays * parseFloat(salaryInfo.baseAmount || 0);
    } else if (salaryInfo.model === 'per_student') {
      // Need to count paid students in assigned batches
      const facultyAssignedBatches = facultyBatches.filter(fb => fb.userId === salaryInfo.userId);
      const paidStudentsCount = enrollments.filter(e => 
        e.feeStatus === 'Paid' && 
        facultyAssignedBatches.some(fb => fb.batchName === e.batchName && fb.subject === e.subject)
      ).length;
      return (workingDays > 0 ? 1 : 0) * (paidStudentsCount * parseFloat(salaryInfo.perStudentRate || 0));
    }
    
    return 0;
  };

  const saveSalarySettings = async (facId: string, data: any) => {
    try {
      const docId = `salary_${facId}`;
      await setDoc(doc(db, 'faculty_salaries', docId), {
        userId: facId,
        ...data,
        updatedAt: serverTimestamp()
      }, { merge: true });
      toast.success('Salary settings updated');
    } catch (err) {
      toast.error('Failed to update');
    }
  };

  const recordPayout = async (data: any) => {
    try {
      await addDoc(collection(db, 'payouts'), {
        ...data,
        date: serverTimestamp(),
        createdAt: serverTimestamp()
      });
      toast.success('Payout record saved');
    } catch (err) {
      toast.error('Failed to save payout');
    }
  };

  const handleResignation = async () => {
    if (!resignationDate) return;
    try {
      await addDoc(collection(db, 'resignations'), {
        userId: user.uid,
        userName: user.displayName || user.email,
        email: user.email,
        resignationDate,
        submittedAt: serverTimestamp(),
        status: 'pending'
      });
      setIsResigning(false);
      toast.success('Resignation submitted. 15-day notice period policy applies.');
    } catch (err) {
      toast.error('Failed to submit');
    }
  };

  const facultyManagedBatches = facultyBatches.filter(fb => fb.userId === user.uid || fb.email === user.email);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2 italic">
            <Wallet className="text-[var(--primary)]" />
            FACULTY & PAYROLL
          </h2>
          <p className="text-sm opacity-60">Salary management and payment tracking</p>
        </div>
        
        <div className="flex flex-wrap gap-2 p-1 bg-white/5 rounded-2xl border border-white/5">
          {isFaculty && (
            <button 
              onClick={() => setActiveTab('overview')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${activeTab === 'overview' ? 'bg-[var(--primary)] text-white' : 'text-gray-500 hover:text-white'}`}
            >
              My Earnings
            </button>
          )}
          {isAdmin && (
            <button 
              onClick={() => setActiveTab('settings')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${activeTab === 'settings' ? 'bg-[var(--primary)] text-white' : 'text-gray-500 hover:text-white'}`}
            >
              Faculty Settings
            </button>
          )}
          <button 
            onClick={() => setActiveTab('payouts')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${activeTab === 'payouts' ? 'bg-[var(--primary)] text-white' : 'text-gray-500 hover:text-white'}`}
          >
            Payout History
          </button>
          {isFaculty && (
            <button 
              onClick={() => setActiveTab('student-payments')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${activeTab === 'student-payments' ? 'bg-[var(--primary)] text-white' : 'text-gray-500 hover:text-white'}`}
            >
              Student Status
            </button>
          )}
        </div>
      </div>

      <AnimatePresence mode="wait">
        {activeTab === 'overview' && isFaculty && (
          <motion.div key="overview" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="glass-card p-6 bg-indigo-500/10 border-indigo-500/20">
                <div className="text-[10px] uppercase font-black opacity-40 mb-1">Net Receivable (This Month)</div>
                <div className="text-4xl font-black text-indigo-500">₹{Math.round(calculateNetReceivable(mySalaryInfo, attendance)).toLocaleString()}</div>
                <div className="mt-2 text-[10px] opacity-60">Based on {attendance.filter(a => a.userId === user.uid && a.isApproved && a.dateStr.startsWith(new Date().toISOString().slice(0,7))).length} verified working days</div>
              </div>
              
              <div className="glass-card p-6 flex flex-col justify-between">
                <div>
                   <div className="text-[10px] uppercase font-black opacity-40 mb-1">Payment Method</div>
                   <div className="text-sm font-bold flex items-center gap-2">
                     <CreditCard size={16} /> 
                     {mySalaryInfo?.paymentMethod?.upiId || 'Not Set'}
                   </div>
                </div>
                <button 
                  onClick={() => setIsRequestingPayout(true)}
                  className="mt-4 py-2 bg-indigo-500 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:scale-105 transition-all"
                >
                  Request Early Disbursement
                </button>
              </div>

              <div className="glass-card p-6 flex flex-col justify-between">
                 <div>
                    <div className="text-[10px] uppercase font-black opacity-40 mb-1">Current Status</div>
                    <div className="text-sm font-bold text-green-500 flex items-center gap-2">
                      <CheckCircle2 size={16} /> Active Employee
                    </div>
                 </div>
                 <button 
                  onClick={() => setIsResigning(true)}
                  className="mt-4 py-2 bg-red-500/10 text-red-500 border border-red-500/20 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-red-500/20 transition-all"
                 >
                   Resign From Position
                 </button>
              </div>
            </div>

            <div className="glass-card overflow-hidden">
               <div className="p-4 border-b border-white/5 bg-white/5 font-bold italic">MY PAYOUT LOGS</div>
               <div className="overflow-x-auto">
                 <table className="w-full text-left">
                   <thead className="bg-white/5 text-[10px] font-black uppercase opacity-40">
                     <tr>
                       <th className="p-4">Date</th>
                       <th className="p-4">Amount</th>
                       <th className="p-4">Transaction ID</th>
                       <th className="p-4">Note</th>
                       <th className="p-4">Receipt</th>
                     </tr>
                   </thead>
                   <tbody className="divide-y divide-white/5 text-xs">
                     {payouts.filter(p => p.userId === user.uid).map(p => (
                       <tr key={p.id}>
                         <td className="p-4 font-bold">{p.date?.toDate().toLocaleDateString()}</td>
                         <td className="p-4 font-black">₹{p.amount.toLocaleString()}</td>
                         <td className="p-4 font-mono opacity-60">{p.transactionId || '---'}</td>
                         <td className="p-4 italic opacity-60">{p.note || 'Regular Payout'}</td>
                         <td className="p-4">
                           {p.receiptUrl && <a href={p.receiptUrl} target="_blank" className="text-[var(--primary)] hover:underline">View</a>}
                         </td>
                       </tr>
                     ))}
                   </tbody>
                 </table>
               </div>
            </div>
          </motion.div>
        )}

        {activeTab === 'settings' && isAdmin && (
          <motion.div key="settings" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
            <div className="grid grid-cols-1 gap-4">
              {facultyList.map(faculty => {
                const salary = facultySalaries.find(s => s.userId === faculty.id);
                return (
                  <div key={faculty.id} className="glass-card p-6 flex flex-col md:flex-row gap-6 border-l-4 border-[var(--primary)]">
                    <div className="flex-1 space-y-4">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-full bg-[var(--primary)]/10 text-[var(--primary)] flex items-center justify-center font-bold">
                          {faculty.name?.charAt(0)}
                        </div>
                        <div>
                          <h4 className="font-bold">{faculty.name}</h4>
                          <p className="text-[10px] opacity-40">{faculty.email}</p>
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                         <div className="space-y-1">
                            <label className="text-[8px] font-black uppercase opacity-40 pl-1">Salary Model</label>
                            <select 
                              value={salary?.model || 'monthly'}
                              onChange={(e) => saveSalarySettings(faculty.id, { model: e.target.value })}
                              className="w-full p-2 bg-white/5 border border-white/10 rounded-lg text-xs font-bold"
                            >
                              <option value="monthly">Monthly Fixed</option>
                              <option value="daily">Per Day Fix</option>
                              <option value="per_student">Per Paid Student</option>
                            </select>
                         </div>
                         <div className="space-y-1">
                            <label className="text-[8px] font-black uppercase opacity-40 pl-1">Base Amount (₹)</label>
                            <input 
                              type="number"
                              value={salary?.baseAmount || ''}
                              onChange={(e) => saveSalarySettings(faculty.id, { baseAmount: e.target.value })}
                              className="w-full p-2 bg-white/5 border border-white/10 rounded-lg text-xs font-bold"
                            />
                         </div>
                         <div className="space-y-1">
                            <label className="text-[8px] font-black uppercase opacity-40 pl-1">Per Student Rate (₹)</label>
                            <input 
                              type="number"
                              value={salary?.perStudentRate || ''}
                              onChange={(e) => saveSalarySettings(faculty.id, { perStudentRate: e.target.value })}
                              className="w-full p-2 bg-white/5 border border-white/10 rounded-lg text-xs font-bold"
                            />
                         </div>
                         <div className="flex items-end">
                            <button 
                              onClick={() => {
                                const amount = calculateNetReceivable(salary, attendance);
                                const confirm = window.confirm(`Generate payout of ₹${Math.round(amount)} for ${faculty.name}?`);
                                if (confirm) {
                                  recordPayout({
                                    userId: faculty.id,
                                    userName: faculty.name,
                                    amount: Math.round(amount),
                                    note: `Auto-generated monthly payout`,
                                    transactionId: `TXN-${Date.now()}`
                                  });
                                }
                              }}
                              className="w-full p-2 bg-[var(--primary)] text-white rounded-lg text-[10px] font-black uppercase"
                            >
                              Process Payout
                            </button>
                         </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}

        {activeTab === 'payouts' && (
           <motion.div key="payouts" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="glass-card overflow-hidden">
             <div className="p-4 border-b border-white/5 bg-white/5 flex justify-between items-center">
               <span className="font-bold italic">ALL TRANSACTION LOGS</span>
               {isAdmin && (
                  <button className="p-2 bg-[var(--primary)] text-white rounded-lg"><Plus size={16} /></button>
               )}
             </div>
             <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-white/5 text-[10px] font-black uppercase opacity-40">
                    <tr>
                      <th className="p-4">Faculty</th>
                      <th className="p-4">Date</th>
                      <th className="p-4">Amount</th>
                      <th className="p-4">Transaction ID</th>
                      <th className="p-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 text-xs">
                    {payouts.map(p => (
                      <tr key={p.id} className="hover:bg-white/5">
                        <td className="p-4">
                          <div className="font-bold">{p.userName}</div>
                          <div className="text-[8px] opacity-40 uppercase">Payout</div>
                        </td>
                        <td className="p-4">{p.date?.toDate().toLocaleDateString()}</td>
                        <td className="p-4 font-black">₹{p.amount.toLocaleString()}</td>
                        <td className="p-4 font-mono opacity-60">{p.transactionId}</td>
                        <td className="p-4 text-right">
                          {isAdmin && (
                            <div className="flex justify-end gap-2">
                              <button onClick={() => firestoreService.deleteItem('payouts', p.id)} className="p-1.5 text-red-500 hover:bg-red-500/10 rounded"><Trash2 size={14}/></button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
             </div>
           </motion.div>
        )}

        {activeTab === 'student-payments' && isFaculty && (
          <motion.div key="students" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
               {enrollments.filter(e => facultyManagedBatches.some(fb => fb.batchName === e.batchName && (fb.subject === 'ALL' || fb.subject === e.subjects?.[0]))).map(e => (
                 <div key={e.id} className="glass-card p-4 flex items-center justify-between border-l-4 border-l-transparent" style={{ borderLeftColor: e.feeStatus === 'Paid' ? '#10b981' : '#ef4444' }}>
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${e.feeStatus === 'Paid' ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}`}>
                        {e.feeStatus === 'Paid' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                      </div>
                      <div>
                        <div className="text-sm font-bold">{e.name}</div>
                        <div className="text-[10px] opacity-60">{e.batchName} • {e.subjects?.join(', ')}</div>
                      </div>
                    </div>
                    <div className="text-right">
                       <span className={`text-[10px] font-black uppercase ${e.feeStatus === 'Paid' ? 'text-green-500' : 'text-red-500'}`}>
                         {e.feeStatus || 'Pending'}
                       </span>
                       <div className="text-[8px] opacity-40">Current Month</div>
                    </div>
                 </div>
               ))}
               {enrollments.length === 0 && <div className="p-10 text-center opacity-40 italic">No assigned students found.</div>}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Resignation Modal */}
      <AnimatePresence>
        {isResigning && (
          <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4">
             <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setIsResigning(false)} />
             <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="relative w-full max-w-md bg-white dark:bg-[#1e1e1e] rounded-3xl p-8 space-y-6">
                <h3 className="text-2xl font-black italic">SUBMIT RESIGNATION</h3>
                <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-2xl text-xs space-y-2 text-amber-500">
                   <p className="font-bold flex items-center gap-2"><AlertCircle size={14}/> Notice Period Policy</p>
                   <p className="opacity-80">Employees must provide a 15-day notice period. A full calendar month notice is preferred for smooth transitions.</p>
                </div>
                <div className="space-y-2">
                   <label className="text-[10px] font-black uppercase opacity-40">Proposed Last Working Day</label>
                   <input 
                    type="date" 
                    value={resignationDate}
                    onChange={(e) => setResignationDate(e.target.value)}
                    className="w-full p-4 bg-gray-100 dark:bg-white/5 border border-white/10 rounded-2xl outline-none"
                   />
                </div>
                <button 
                  onClick={handleResignation}
                  className="w-full py-4 bg-red-500 text-white rounded-2xl font-black uppercase tracking-widest"
                >
                  Confirm Submission
                </button>
             </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
