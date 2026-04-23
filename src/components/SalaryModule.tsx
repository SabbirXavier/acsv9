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
import html2canvas from 'html2canvas';
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
  const [resignations, setResignations] = useState<any[]>([]);
  const [isAddingPayout, setIsAddingPayout] = useState(false);
  const [payoutForm, setPayoutForm] = useState({ userId: '', amount: '', transactionId: '', note: '' });
  
  // Faculty Custom Payment Edit & Wrapped
  const [isEditingPayment, setIsEditingPayment] = useState(false);
  const [paymentUpi, setPaymentUpi] = useState('');
  const [paymentBank, setPaymentBank] = useState('');
  const [showWrapped, setShowWrapped] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0,7));

  const handleShareWrapped = async () => {
    const el = document.getElementById('faculty-wrapped-card');
    if (!el) return;
    try {
      toast.loading('Generating your flex card...', { id: 'wrapped' });
      const canvas = await html2canvas(el, { backgroundColor: '#0f0f13', scale: 2 });
      const imgData = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = imgData;
      a.download = `Faculty_Wrapped_${user?.displayName || 'Card'}.png`;
      a.click();
      toast.success('Downloaded! Share it on WhatsApp \uD83D\uDD25', { id: 'wrapped' });
    } catch(err) {
      toast.error('Failed to generate image', { id: 'wrapped' });
    }
  };

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

    const unsubResignations = firestoreService.listenToCollection('resignations', (data) => {
      setResignations(data);
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
      unsubResignations();
    };
  }, [user.uid, isAdmin, isFaculty]);

  const calculateNetReceivable = (salaryInfo: any, currentAttendance: any[]) => {
    if (!salaryInfo) return 0;
    
    // Filter approved attendance for this month
    const monthApproved = currentAttendance.filter(a => 
      a.userId === salaryInfo.userId && 
      a.dateStr.startsWith(selectedMonth) && 
      a.isApproved
    );

    const workingDays = monthApproved.length;
    
    if (salaryInfo.model === 'monthly') {
      const parts = selectedMonth.split('-');
      const year = parseInt(parts[0]);
      const month = parseInt(parts[1]);
      const fixedSalary = parseFloat(salaryInfo.baseAmount || 0);
      const totalDaysInMonth = new Date(year, month, 0).getDate();
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
              onClick={() => setActiveTab('settings' as any)}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${activeTab === 'settings' ? 'bg-[var(--primary)] text-white' : 'text-gray-500 hover:text-white'}`}
            >
              Faculty Settings
            </button>
          )}
          {isAdmin && (
            <button 
              onClick={() => setActiveTab('requests' as any)}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${activeTab === ('requests' as any) ? 'bg-[var(--primary)] text-white' : 'text-gray-500 hover:text-white'}`}
            >
              Requests
              {resignations.length > 0 && <span className="ml-2 px-1.5 py-0.5 bg-red-500 text-white rounded text-[10px]">{resignations.length}</span>}
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
                <div className="text-[10px] uppercase font-black opacity-40 mb-1">Net Receivable (Monthly)</div>
                <div className="text-4xl font-black text-indigo-500">₹{Math.round(calculateNetReceivable(mySalaryInfo, attendance)).toLocaleString()}</div>
                <div className="mt-2 flex items-center gap-2">
                  <input type="month" value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} className="text-[10px] p-1 bg-white/10 rounded outline-none border border-white/10" />
                  <span className="text-[10px] opacity-60">Based on {attendance.filter(a => a.userId === user.uid && a.isApproved && a.dateStr.startsWith(selectedMonth)).length} verified working days</span>
                </div>
              </div>
              
              <div className="glass-card p-6 flex flex-col justify-between">
                <div>
                   <div className="text-[10px] uppercase font-black opacity-40 mb-1 flex items-center justify-between">
                     Payment Method
                     <button onClick={() => {
                        setPaymentUpi(mySalaryInfo?.paymentMethod?.upiId || '');
                        setPaymentBank(mySalaryInfo?.paymentMethod?.bankDetails || '');
                        setIsEditingPayment(true);
                     }} className="text-indigo-500 hover:scale-110 transition-transform"><Edit2 size={12} /></button>
                   </div>
                   <div className="text-sm font-bold flex flex-col gap-2 mt-2">
                     <div className="flex items-center gap-2"><CreditCard size={14} className="text-indigo-500" /> UPI: {mySalaryInfo?.paymentMethod?.upiId || 'Not Set'}</div>
                     <div className="flex items-center gap-2 text-xs opacity-70"><Wallet size={14} /> Bank: {mySalaryInfo?.paymentMethod?.bankDetails || 'Not Set'}</div>
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
                 <div className="flex gap-2 mt-4">
                   <button 
                    onClick={() => setShowWrapped(true)}
                    className="flex-[2] py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:scale-105 transition-transform flex justify-center items-center gap-2"
                   >
                     <span>Generate Flex Card</span>
                   </button>
                   <button 
                    onClick={() => setIsResigning(true)}
                    className="flex-1 py-2 bg-red-500/10 text-red-500 border border-red-500/20 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-red-500/20 transition-all flex justify-center items-center"
                   >
                     Resign
                   </button>
                 </div>
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
                  <button onClick={() => setIsAddingPayout(true)} className="p-2 bg-[var(--primary)] text-white rounded-lg hover:opacity-80 transition-opacity"><Plus size={16} /></button>
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
            <div className="flex justify-between items-center mb-4">
               <div>
                  <h3 className="font-bold">Student Fee Status</h3>
                  <p className="text-xs opacity-60">Status of students in your assigned batches</p>
               </div>
               <button 
                 onClick={() => {
                   const qs = new URLSearchParams(window.location.search);
                   const showUnpaid = qs.get('unpaid') === 'true';
                   if (showUnpaid) qs.delete('unpaid');
                   else qs.set('unpaid', 'true');
                   window.history.replaceState(null, '', `?${qs.toString()}`);
                   setActiveTab((prev) => {
                     setActiveTab('overview');
                     setTimeout(() => setActiveTab('student-payments'), 0);
                     return prev;
                   });
                 }}
                 className={`px-4 py-2 rounded-xl text-xs font-bold transition-all border ${window.location.search.includes('unpaid=true') ? 'bg-red-500/10 text-red-500 border-red-500/20' : 'bg-white/5 border-white/10 hover:bg-white/10'}`}
               >
                 {window.location.search.includes('unpaid=true') ? 'Showing Unpaid Only' : 'Show Unpaid Only'}
               </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
               {enrollments
                 .filter(e => facultyManagedBatches.some(fb => fb.batchName === e.batchName && (fb.subject === 'ALL' || fb.subject === e.subjects?.[0])))
                 .filter(e => window.location.search.includes('unpaid=true') ? e.feeStatus !== 'Paid' : true)
                 .map(e => (
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
                       {e.feeStatus !== 'Paid' && (
                         <div className="text-[10px] text-indigo-500 font-bold mt-1 cursor-pointer hover:underline" onClick={() => {
                           const msg = `Hi ${e.name},\nThis is a gentle reminder regarding your pending tuition fees. Please clear them.`;
                           window.open(`https://wa.me/${e.whatsapp?.replace(/\D/g, '')}?text=${encodeURIComponent(msg)}`);
                         }}>Nudge</div>
                       )}
                    </div>
                 </div>
               ))}
               {enrollments.length === 0 && <div className="p-10 text-center opacity-40 italic">No assigned students found.</div>}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Requests Tab */}
      <AnimatePresence mode="wait">
        {(activeTab as any) === 'requests' && isAdmin && (
          <motion.div key="requests" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
            <h3 className="font-bold text-lg mb-4 text-amber-500 flex items-center gap-2">
              <AlertCircle size={20} /> Action Required
            </h3>
            <div className="grid gap-4">
              {resignations.length === 0 && <div className="p-8 text-center text-sm opacity-50 italic border border-dashed border-white/10 rounded-2xl">No pending requests</div>}
              {resignations.map(req => (
                <div key={req.id} className="glass-card p-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-l-4 border-amber-500">
                  <div>
                    <h4 className="font-bold">{req.userName} <span className="text-[10px] bg-amber-500/10 text-amber-500 px-2 py-0.5 rounded ml-2 uppercase tracking-widest">{req.status}</span></h4>
                    <p className="text-xs opacity-60 mt-1">Resignation submitted. Proposed LWD: {req.resignationDate}</p>
                    <p className="text-[10px] opacity-40 mt-1">Email: {req.email}</p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => firestoreService.updateItem('resignations', req.id, { status: 'approved', approvedAt: new Date().toISOString() })} className="px-4 py-2 bg-green-500/10 text-green-500 rounded-lg text-xs font-bold hover:bg-green-500 text-white transition-colors">Approve</button>
                    <button onClick={() => firestoreService.updateItem('resignations', req.id, { status: 'rejected' })} className="px-4 py-2 bg-red-500/10 text-red-500 rounded-lg text-xs font-bold hover:bg-red-500 hover:text-white transition-colors">Reject</button>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Add Payout Modal */}
      <AnimatePresence>
        {isAddingPayout && isAdmin && (
          <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setIsAddingPayout(false)} />
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="relative w-full max-w-md bg-white dark:bg-[#1e1e1e] rounded-3xl p-8 space-y-6">
              <h3 className="text-xl font-black italic">RECORD MANUAL PAYOUT</h3>
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase opacity-40">Select Faculty</label>
                  <select
                    className="w-full p-3 bg-gray-100 dark:bg-white/5 border border-white/10 rounded-xl text-sm"
                    value={payoutForm.userId}
                    onChange={e => setPayoutForm({...payoutForm, userId: e.target.value})}
                  >
                    <option value="">Select Faculty...</option>
                    {facultyList.map(f => (
                      <option key={f.id} value={f.id}>{f.name || f.email}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase opacity-40">Amount (₹)</label>
                  <input
                    type="number"
                    className="w-full p-3 bg-gray-100 dark:bg-white/5 border border-white/10 rounded-xl text-sm outline-none focus:border-[var(--primary)]"
                    value={payoutForm.amount}
                    onChange={e => setPayoutForm({...payoutForm, amount: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase opacity-40">Transaction ID</label>
                  <input
                    type="text"
                    className="w-full p-3 bg-gray-100 dark:bg-white/5 border border-white/10 rounded-xl text-sm outline-none focus:border-[var(--primary)]"
                    value={payoutForm.transactionId}
                    onChange={e => setPayoutForm({...payoutForm, transactionId: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase opacity-40">Note</label>
                  <input
                    type="text"
                    placeholder="e.g. Cleared pending dues"
                    className="w-full p-3 bg-gray-100 dark:bg-white/5 border border-white/10 rounded-xl text-sm outline-none focus:border-[var(--primary)]"
                    value={payoutForm.note}
                    onChange={e => setPayoutForm({...payoutForm, note: e.target.value})}
                  />
                </div>
              </div>
              <button 
                onClick={() => {
                  const targetFaculty = facultyList.find(f => f.id === payoutForm.userId);
                  if (targetFaculty && payoutForm.amount) {
                    recordPayout({
                      userId: targetFaculty.id,
                      userName: targetFaculty.name || targetFaculty.email,
                      amount: Number(payoutForm.amount),
                      transactionId: payoutForm.transactionId,
                      note: payoutForm.note
                    });
                    setIsAddingPayout(false);
                    setPayoutForm({ userId: '', amount: '', transactionId: '', note: '' });
                  } else {
                    toast.error('Select faculty and enter amount');
                  }
                }}
                className="w-full py-4 bg-[var(--primary)] text-white rounded-2xl font-black uppercase tracking-widest hover:opacity-90"
              >
                Save Payout Record
              </button>
            </motion.div>
          </div>
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
                   <p className="opacity-80">Employees must provide a 15-day notice period. A full calendar month notice is mandate to complete full calendar month.</p>
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

      {/* Editor Modal for Payment Info */}
      <AnimatePresence>
        {isEditingPayment && (
          <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4">
             <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setIsEditingPayment(false)} />
             <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="relative w-full max-w-sm bg-white dark:bg-[#1e1e1e] rounded-3xl p-8 space-y-6">
                <h3 className="text-xl font-black italic flex items-center gap-2"><CreditCard /> PAYMENT INFO</h3>
                <div className="space-y-4">
                  <div className="space-y-2">
                     <label className="text-[10px] font-black uppercase opacity-40">UPI ID</label>
                     <input 
                      type="text" 
                      value={paymentUpi}
                      onChange={(e) => setPaymentUpi(e.target.value)}
                      placeholder="e.g. name@okhdfcbank"
                      className="w-full p-4 bg-gray-100 dark:bg-white/5 border border-white/10 rounded-2xl outline-none text-sm"
                     />
                  </div>
                  <div className="space-y-2">
                     <label className="text-[10px] font-black uppercase opacity-40">Bank Details (Optional)</label>
                     <textarea 
                      value={paymentBank}
                      onChange={(e) => setPaymentBank(e.target.value)}
                      placeholder="Account No / IFSC"
                      rows={3}
                      className="w-full p-4 bg-gray-100 dark:bg-white/5 border border-white/10 rounded-2xl outline-none text-sm resize-none"
                     />
                  </div>
                  <button 
                    onClick={() => {
                      saveSalarySettings(user.uid, { paymentMethod: { upiId: paymentUpi, bankDetails: paymentBank } });
                      setIsEditingPayment(false);
                    }}
                    className="w-full py-4 bg-indigo-500 text-white rounded-2xl font-black uppercase tracking-widest hover:scale-105 transition-all shadow-lg"
                  >
                    Save Details
                  </button>
                </div>
             </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Spotify Wrapped Style Card */}
      <AnimatePresence>
        {showWrapped && (
          <div className="fixed inset-0 z-[3000] flex items-center justify-center p-4">
             <div className="absolute inset-0 bg-black/90 backdrop-blur-md" onClick={() => setShowWrapped(false)} />
             <motion.div initial={{ opacity: 0, y: 50, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} className="relative w-full max-w-sm flex flex-col items-center gap-6">
                {/* Wrapped Card that gets exported */}
                <div id="faculty-wrapped-card" className="w-[320px] aspect-[9/16] bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-600 rounded-[2rem] p-8 flex flex-col justify-between overflow-hidden relative shadow-2xl">
                  {/* Decorative Elements */}
                  <div className="absolute -top-20 -right-20 w-64 h-64 bg-white/10 rounded-full blur-3xl"></div>
                  <div className="absolute -bottom-10 -left-10 w-40 h-40 bg-black/20 rounded-full blur-2xl"></div>
                  
                  <div className="relative z-10 w-full flex items-center justify-between">
                    <span className="text-white/80 font-black text-xs tracking-widest uppercase">My Batch {new Date().getFullYear()}</span>
                    <span className="px-2 py-1 bg-black/20 text-white rounded-lg text-[10px] font-bold border border-white/20">FACULTY</span>
                  </div>

                  <div className="relative z-10 space-y-6">
                    <div>
                      <h2 className="text-4xl font-black text-white italic leading-tight">
                        Here's Your<br/>Status, <br/>
                        <span className="text-transparent bg-clip-text bg-gradient-to-r from-yellow-300 to-yellow-500">{user?.displayName?.split(' ')[0] || 'Sir'}</span>
                      </h2>
                    </div>

                    {(() => {
                      const facultyAssignedBatches = facultyBatches.filter(fb => fb.userId === user.uid);
                      const monthLogs = attendance.filter(a => a.userId === user.uid && a.dateStr.startsWith(selectedMonth));
                      const presentDays = monthLogs.filter(a => a.status === 'present').length;
                      const attendanceRate = monthLogs.length > 0 ? Math.round((presentDays / monthLogs.length) * 100) : 100;

                      return (
                        <div className="space-y-4">
                          <div className="bg-black/20 p-4 rounded-2xl backdrop-blur-md border border-white/10 flex items-center justify-between">
                            <span className="text-white/70 text-xs font-bold uppercase tracking-wider">Active Classes</span>
                            <span className="text-white text-xl font-black">{facultyAssignedBatches.length}</span>
                          </div>
                          
                          <div className="bg-white p-4 rounded-2xl flex items-center justify-between shadow-xl">
                            <span className="text-purple-600 text-xs font-bold uppercase tracking-wider">Days Logged</span>
                            <span className="text-purple-600 text-xl font-black">{presentDays}/{monthLogs.length || 1}</span>
                          </div>

                          <div className="bg-black/20 p-4 rounded-2xl backdrop-blur-md border border-white/10 flex items-center justify-between">
                            <span className="text-white/70 text-xs font-bold uppercase tracking-wider">Reliability Rate</span>
                            <span className="text-yellow-400 text-xl font-black">{attendanceRate}%</span>
                          </div>
                        </div>
                      );
                    })()}
                  </div>

                  <div className="relative z-10 w-full text-center">
                    <p className="text-[10px] text-white/50 font-bold tracking-widest uppercase">Powered by Helium</p>
                  </div>
                </div>

                {/* Download Button */}
                <button 
                  onClick={handleShareWrapped}
                  className="w-[320px] py-4 bg-white text-black rounded-full font-black uppercase tracking-widest hover:scale-105 transition-all shadow-[0_0_40px_rgba(255,255,255,0.3)] flex items-center justify-center gap-2"
                >
                  <Download size={18} /> Share My Flex
                </button>
             </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
