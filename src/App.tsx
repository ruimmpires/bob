import React, { useState, useEffect, createContext, useContext, useMemo } from 'react';
import { 
  HardHat, Hammer, Wrench, Construction, User as UserIcon, LogOut, Plus, Check, X, 
  MessageSquare, LayoutDashboard, ClipboardList, Settings, ChevronRight, 
  TrendingUp, Clock, CheckCircle2, AlertCircle, MapPin, DollarSign, Package,
  Calendar as CalendarIcon, ChevronLeft, Trash2, Briefcase
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  auth, db, googleProvider, OperationType, handleFirestoreError, testConnection 
} from './firebase';
import { 
  signInWithPopup, signOut, onAuthStateChanged, User 
} from 'firebase/auth';
import { 
  doc, getDoc, setDoc, collection, query, where, onSnapshot, addDoc, updateDoc, 
  Timestamp, serverTimestamp, orderBy, deleteDoc, or 
} from 'firebase/firestore';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { 
  format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, 
  eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths,
  parseISO, isWithinInterval
} from 'date-fns';

// --- Utilities ---
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Types ---
type UserRole = 'owner' | 'constructor' | 'admin';

interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
}

interface Comment {
  uid: string;
  displayName: string;
  text: string;
  timestamp: string;
}

interface Work {
  id: string;
  ownerUid: string;
  ownerName: string;
  constructorUid?: string;
  constructorName?: string;
  location: string;
  details: string;
  costs?: number;
  materials?: string;
  startDate?: string;
  endDate?: string;
  status: 'pending' | 'accepted' | 'in-progress' | 'completed' | 'cancelled';
  isPublic?: boolean;
  comments?: Comment[];
  createdAt: any;
}

// --- Context ---
interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  signIn: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}

// --- Components ---

const Button = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' | 'outline' }>(
  ({ className, variant = 'primary', ...props }, ref) => {
    const variants = {
      primary: 'bg-[#FFD700] text-black hover:bg-[#FFC400] shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]',
      secondary: 'bg-[#0056B3] text-white hover:bg-[#004494] shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]',
      danger: 'bg-[#D32F2F] text-white hover:bg-[#B71C1C] shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]',
      outline: 'border-2 border-black bg-white text-black hover:bg-gray-100 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]',
    };

    return (
      <button
        ref={ref}
        className={cn(
          'px-4 py-2 font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed',
          variants[variant],
          className
        )}
        {...props}
      />
    );
  }
);

const Card = ({ children, className, title, icon: Icon }: { children: React.ReactNode; className?: string; title?: string; icon?: any }) => (
  <div className={cn('bg-white border-4 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] overflow-hidden', className)}>
    {title && (
      <div className="bg-[#FFD700] border-b-4 border-black p-4 flex items-center gap-3">
        {Icon && <Icon className="w-6 h-6" />}
        <h3 className="font-black text-xl uppercase italic">{title}</h3>
      </div>
    )}
    <div className="p-6">{children}</div>
  </div>
);

const Badge = ({ children, status }: { children: React.ReactNode; status: Work['status'] }) => {
  const colors = {
    pending: 'bg-gray-200 text-gray-800 border-gray-400',
    accepted: 'bg-blue-100 text-blue-800 border-blue-400',
    'in-progress': 'bg-yellow-100 text-yellow-800 border-yellow-400',
    completed: 'bg-green-100 text-green-800 border-green-400',
    cancelled: 'bg-red-100 text-red-800 border-red-400',
  };
  return (
    <span className={cn('px-3 py-1 rounded-full text-xs font-black uppercase border-2', colors[status])}>
      {children}
    </span>
  );
};

// --- Main App ---

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    testConnection();
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        try {
          const profileDoc = await getDoc(doc(db, 'users', u.uid));
          if (profileDoc.exists()) {
            setProfile(profileDoc.data() as UserProfile);
          } else {
            const isAdmin = u.email === 'rui.marques.pires@gmail.com';
            const newProfile: UserProfile = {
              uid: u.uid,
              email: u.email || '',
              displayName: u.displayName || 'Usuário',
              role: isAdmin ? 'admin' : 'owner',
            };
            await setDoc(doc(db, 'users', u.uid), newProfile);
            setProfile(newProfile);
          }
        } catch (error) {
          handleFirestoreError(error, OperationType.GET, `users/${u.uid}`);
        }
      } else {
        setProfile(null);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const signIn = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error('Sign in error', error);
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error('Logout error', error);
    }
  };

  const value = useMemo(() => ({ user, profile, loading, signIn, logout }), [user, profile, loading]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FFD700] flex items-center justify-center">
        <motion.div 
          animate={{ rotate: 360 }}
          transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
        >
          <HardHat className="w-16 h-16 text-black" />
        </motion.div>
      </div>
    );
  }

  return (
    <AuthContext.Provider value={value}>
      <div className="min-h-screen bg-[#F3F4F6] bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:16px_16px] text-black font-sans">
        {!user ? <LoginView /> : <MainView />}
      </div>
    </AuthContext.Provider>
  );
}

function LoginView() {
  const { signIn } = useAuth();
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-checkered gap-8">
      <Card className="max-w-md w-full text-center" title="Bem-vindo à Obra!">
        <div className="mb-8 flex justify-center">
          <div className="relative">
            <HardHat className="w-24 h-24 text-[#FFD700] drop-shadow-[4px_4px_0px_rgba(0,0,0,1)]" />
            <Hammer className="absolute -bottom-2 -right-2 w-12 h-12 text-[#0056B3] drop-shadow-[2px_2px_0px_rgba(0,0,0,1)]" />
          </div>
        </div>
        <h1 className="text-3xl font-black mb-4 uppercase italic">Podemos Construir?</h1>
        <p className="text-gray-600 mb-8 font-medium">Sim, podemos! Faça login para gerir as suas obras com o Bob.</p>
        <Button onClick={signIn} className="w-full py-4 text-xl">
          Entrar com Google
        </Button>
      </Card>

      <div className="max-w-4xl w-full">
        <PublicStats />
      </div>
    </div>
  );
}

function PublicStats() {
  const [works, setWorks] = useState<Work[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, 'works'), where('isPublic', '==', true));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const w = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Work));
      setWorks(w);
      setLoading(false);
    }, (error) => console.error('Public stats error:', error));
    return unsubscribe;
  }, []);

  const stats = useMemo(() => {
    const byOwner: Record<string, { total: number, pending: number, completed: number }> = {};
    const byConstructor: Record<string, { total: number, pending: number, completed: number }> = {};

    works.forEach(w => {
      const owner = w.ownerName || 'Desconhecido';
      const constructor = w.constructorName || 'Não atribuído';

      if (!byOwner[owner]) byOwner[owner] = { total: 0, pending: 0, completed: 0 };
      if (!byConstructor[constructor]) byConstructor[constructor] = { total: 0, pending: 0, completed: 0 };

      byOwner[owner].total++;
      byConstructor[constructor].total++;

      if (w.status === 'pending') {
        byOwner[owner].pending++;
        byConstructor[constructor].pending++;
      } else if (w.status === 'completed') {
        byOwner[owner].completed++;
        byConstructor[constructor].completed++;
      }
    });

    return { byOwner, byConstructor };
  }, [works]);

  if (loading) return <div className="text-center font-black uppercase text-white drop-shadow-md">Carregando estatísticas públicas...</div>;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <Card title="Obras por Dono" icon={UserIcon}>
        <div className="space-y-3">
          {(Object.entries(stats.byOwner) as [string, { total: number, pending: number, completed: number }][]).map(([name, data]) => (
            <div key={name} className="flex justify-between items-center border-b-2 border-gray-100 pb-2 last:border-0">
              <span className="font-bold text-sm truncate max-w-[150px]">{name}</span>
              <div className="flex gap-2">
                <span className="text-[10px] bg-gray-200 px-2 py-1 font-black">{data.total} Total</span>
                <span className="text-[10px] bg-green-200 px-2 py-1 font-black">{data.completed} OK</span>
              </div>
            </div>
          ))}
          {Object.keys(stats.byOwner).length === 0 && <p className="text-gray-400 italic text-center">Sem dados.</p>}
        </div>
      </Card>

      <Card title="Obras por Construtor" icon={HardHat}>
        <div className="space-y-3">
          {(Object.entries(stats.byConstructor) as [string, { total: number, pending: number, completed: number }][]).map(([name, data]) => (
            <div key={name} className="flex justify-between items-center border-b-2 border-gray-100 pb-2 last:border-0">
              <span className="font-bold text-sm truncate max-w-[150px]">{name}</span>
              <div className="flex gap-2">
                <span className="text-[10px] bg-gray-200 px-2 py-1 font-black">{data.total} Total</span>
                <span className="text-[10px] bg-green-200 px-2 py-1 font-black">{data.completed} OK</span>
              </div>
            </div>
          ))}
          {Object.keys(stats.byConstructor).length === 0 && <p className="text-gray-400 italic text-center">Sem dados.</p>}
        </div>
      </Card>
    </div>
  );
}

function MainView() {
  const { profile, logout } = useAuth();
  const [activeTab, setActiveTab] = useState<'dashboard' | 'constructor_works' | 'owner_works' | 'public' | 'calendar' | 'admin'>('dashboard');

  return (
    <div className="flex flex-col md:flex-row min-h-screen">
      {/* Sidebar */}
      <aside className="w-full md:w-64 bg-black text-white p-6 flex flex-col gap-8 border-r-4 border-black">
        <div className="flex items-center gap-3 mb-4 p-4 bg-checkered border-4 border-black rotate-[-2deg] shadow-[4px_4px_0px_0px_rgba(255,255,255,1)]">
          <HardHat className="w-10 h-10 text-black" />
          <span className="font-black text-xl uppercase italic tracking-tighter text-black drop-shadow-[1px_1px_0px_rgba(255,255,255,1)]">Bob o Construtor</span>
        </div>

        <nav className="flex flex-col gap-4 flex-1">
          <SidebarLink 
            icon={LayoutDashboard} 
            label="Painel" 
            active={activeTab === 'dashboard'} 
            onClick={() => setActiveTab('dashboard')} 
          />
          
          {(profile?.role === 'constructor' || profile?.role === 'admin') && (
            <SidebarLink 
              icon={Hammer} 
              label="Minhas Obras" 
              active={activeTab === 'constructor_works'} 
              onClick={() => setActiveTab('constructor_works')} 
            />
          )}

          {(profile?.role === 'owner' || profile?.role === 'admin') && (
            <SidebarLink 
              icon={ClipboardList} 
              label="Obras Solicitadas" 
              active={activeTab === 'owner_works'} 
              onClick={() => setActiveTab('owner_works')} 
            />
          )}

          <SidebarLink 
            icon={CalendarIcon} 
            label="Calendário" 
            active={activeTab === 'calendar'} 
            onClick={() => setActiveTab('calendar')} 
          />
          <SidebarLink 
            icon={Construction} 
            label="Obras Públicas" 
            active={activeTab === 'public'} 
            onClick={() => setActiveTab('public')} 
          />
          {profile?.role === 'admin' && (
            <SidebarLink 
              icon={Settings} 
              label="Admin" 
              active={activeTab === 'admin'} 
              onClick={() => setActiveTab('admin')} 
            />
          )}
        </nav>

        <div className="pt-6 border-t border-white/20">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-[#FFD700] flex items-center justify-center border-2 border-white">
              <UserIcon className="w-6 h-6 text-black" />
            </div>
            <div className="flex flex-col overflow-hidden">
              <span className="font-bold truncate">{profile?.displayName}</span>
              <span className="text-xs text-gray-400 uppercase font-black">{profile?.role}</span>
            </div>
          </div>
          <Button variant="danger" className="w-full py-2 text-sm" onClick={logout}>
            <LogOut className="w-4 h-4" /> Sair
          </Button>
        </div>
      </aside>

      {/* Content */}
      <main className="flex-1 p-6 md:p-10 overflow-y-auto">
        <AnimatePresence mode="wait">
          {activeTab === 'dashboard' && <DashboardView key="dashboard" />}
          {activeTab === 'constructor_works' && <WorksView key="constructor_works" filterType="constructor" />}
          {activeTab === 'owner_works' && <WorksView key="owner_works" filterType="owner" />}
          {activeTab === 'calendar' && <CalendarView key="calendar" />}
          {activeTab === 'public' && <WorksView key="public" filterType="public" />}
          {activeTab === 'admin' && <AdminView key="admin" />}
        </AnimatePresence>
      </main>
    </div>
  );
}

function SidebarLink({ icon: Icon, label, active, onClick }: { icon: any, label: string, active: boolean, onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-4 p-3 font-bold uppercase tracking-wider transition-all border-2 border-transparent',
        active ? 'bg-[#FFD700] text-black border-black shadow-[4px_4px_0px_0px_rgba(255,255,255,0.2)]' : 'hover:bg-white/10 text-gray-400'
      )}
    >
      <Icon className="w-6 h-6" />
      {label}
    </button>
  );
}

function DashboardView() {
  const { profile } = useAuth();
  const [works, setWorks] = useState<Work[]>([]);
  const [loading, setLoading] = useState(true);

  const bobTips = [
    { quote: "Podemos construir? Sim, podemos!", detail: "Com a atitude certa, nenhum projeto é impossível." },
    { quote: "Segurança em primeiro lugar, equipa!", detail: "Use sempre o equipamento de proteção no estaleiro." },
    { quote: "O trabalho de equipa faz o sonho funcionar.", detail: "Colabore com os seus colegas para melhores resultados." },
    { quote: "Mantenha as ferramentas limpas e prontas.", detail: "Uma ferramenta bem cuidada dura uma vida inteira." },
    { quote: "Um bom planeamento evita surpresas.", detail: "Reveja os seus planos antes de começar a escavar." },
    { quote: "Cada tijolo conta para uma construção sólida.", detail: "Atenção aos detalhes em cada fase da obra." },
    { quote: "Não se esqueça do capacete e do colete!", detail: "A visibilidade e a proteção são fundamentais." },
    { quote: "A organização é a chave do sucesso.", detail: "Mantenha o estaleiro limpo e os materiais arrumados." },
    { quote: "O Scoop está pronto para escavar, e você?", detail: "Prepare o terreno antes de iniciar a fundação." },
    { quote: "Vamos lá, equipa! Mãos à obra!", detail: "O tempo é precioso, vamos cumprir os prazos." }
  ];

  const randomTip = useMemo(() => bobTips[Math.floor(Math.random() * bobTips.length)], []);

  useEffect(() => {
    if (!profile) return;
    let q;
    if (profile.role === 'admin') {
      q = query(collection(db, 'works'));
    } else {
      q = query(
        collection(db, 'works'),
        or(
          where('ownerUid', '==', profile.uid),
          where('constructorUid', '==', profile.uid)
        )
      );
    }

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const w = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Work));
      setWorks(w);
      setLoading(false);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'works'));
    return unsubscribe;
  }, [profile]);

  const stats = useMemo(() => {
    return {
      total: works.length,
      pending: works.filter(w => w.status === 'pending').length,
      accepted: works.filter(w => w.status === 'accepted').length,
      inProgress: works.filter(w => w.status === 'in-progress').length,
      completed: works.filter(w => w.status === 'completed').length,
      cancelled: works.filter(w => w.status === 'cancelled').length,
    };
  }, [works]);

  if (loading) return <div>Carregando estatísticas...</div>;

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="space-y-8"
    >
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-4xl font-black uppercase italic mb-2">Painel de Controlo</h2>
          <p className="text-gray-600 font-medium">Como está a correr o nosso estaleiro?</p>
        </div>
        <div className="hidden md:block">
          <Construction className="w-16 h-16 text-[#FFD700]" />
        </div>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6">
        <StatCard label="Pendentes" value={stats.pending} icon={Clock} color="bg-gray-500" />
        <StatCard label="Aceites" value={stats.accepted} icon={CheckCircle2} color="bg-blue-500" />
        <StatCard label="Em Execução" value={stats.inProgress} icon={Hammer} color="bg-yellow-500" />
        <StatCard label="Terminadas" value={stats.completed} icon={Check} color="bg-green-500" />
        <StatCard label="Canceladas" value={stats.cancelled} icon={X} color="bg-red-500" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <Card title="Resumo Geral" icon={TrendingUp}>
          <div className="space-y-4">
            <div className="flex justify-between items-center p-4 bg-gray-50 border-2 border-black">
              <span className="font-bold uppercase">Total de Obras</span>
              <span className="text-3xl font-black">{stats.total}</span>
            </div>
            <div className="h-4 w-full bg-gray-200 border-2 border-black rounded-full overflow-hidden flex">
              <div style={{ width: `${stats.total > 0 ? (stats.pending / stats.total) * 100 : 0}%` }} className="bg-gray-500 h-full" />
              <div style={{ width: `${stats.total > 0 ? (stats.accepted / stats.total) * 100 : 0}%` }} className="bg-blue-500 h-full" />
              <div style={{ width: `${stats.total > 0 ? (stats.inProgress / stats.total) * 100 : 0}%` }} className="bg-yellow-500 h-full" />
              <div style={{ width: `${stats.total > 0 ? (stats.completed / stats.total) * 100 : 0}%` }} className="bg-green-500 h-full" />
              <div style={{ width: `${stats.total > 0 ? (stats.cancelled / stats.total) * 100 : 0}%` }} className="bg-red-500 h-full" />
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs font-black uppercase">
              <div className="flex items-center gap-2"><div className="w-3 h-3 bg-gray-500" /> Pendentes</div>
              <div className="flex items-center gap-2"><div className="w-3 h-3 bg-blue-500" /> Aceites</div>
              <div className="flex items-center gap-2"><div className="w-3 h-3 bg-yellow-500" /> Em Execução</div>
              <div className="flex items-center gap-2"><div className="w-3 h-3 bg-green-500" /> Terminadas</div>
              <div className="flex items-center gap-2"><div className="w-3 h-3 bg-red-500" /> Canceladas</div>
            </div>
          </div>
        </Card>

        <Card title="Dica do Bob" icon={HardHat}>
          <div className="flex gap-4 items-start">
            <div className="bg-[#FFD700] p-3 rounded-full border-2 border-black">
              <Wrench className="w-8 h-8" />
            </div>
            <div>
              <p className="font-bold text-lg italic mb-2">"{randomTip.quote}"</p>
              <p className="text-gray-600">{randomTip.detail}</p>
            </div>
          </div>
        </Card>
      </div>
    </motion.div>
  );
}

function StatCard({ label, value, icon: Icon, color }: { label: string, value: number, icon: any, color: string }) {
  return (
    <div className="bg-white border-4 border-black shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] p-6 flex items-center gap-4">
      <div className={cn('p-3 border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]', color)}>
        <Icon className="w-8 h-8 text-white" />
      </div>
      <div>
        <div className="text-sm font-black uppercase text-gray-500">{label}</div>
        <div className="text-3xl font-black">{value}</div>
      </div>
    </div>
  );
}

function WorksView({ filterType = 'constructor' }: { filterType?: 'constructor' | 'owner' | 'public' | 'all'; key?: string }) {
  const { profile } = useAuth();
  const [works, setWorks] = useState<Work[]>([]);
  const [constructors, setConstructors] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [selectedWork, setSelectedWork] = useState<Work | null>(null);

  useEffect(() => {
    if (!profile) return;

    let q;
    if (filterType === 'public') {
      q = query(collection(db, 'works'), where('isPublic', '==', true), orderBy('createdAt', 'desc'));
    } else if (filterType === 'all' || (profile.role === 'admin' && filterType === 'constructor')) {
      // If admin and in constructor view, maybe show all or just assigned? 
      // User said "no menu admin estão a gestão de utilizadores e a gestão de obras"
      // So 'all' will be used in AdminView.
      q = query(collection(db, 'works'), orderBy('createdAt', 'desc'));
    } else if (filterType === 'owner') {
      q = query(collection(db, 'works'), where('ownerUid', '==', profile.uid), orderBy('createdAt', 'desc'));
    } else {
      // Default to constructor filter
      q = query(collection(db, 'works'), where('constructorUid', '==', profile.uid), orderBy('createdAt', 'desc'));
    }

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const w = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Work));
      setWorks(w);
      setLoading(false);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'works'));

    // Fetch all users who can be constructors (now includes owners)
    const qUsers = query(collection(db, 'users'), where('role', 'in', ['owner', 'constructor', 'admin']));
    const unsubscribeUsers = onSnapshot(qUsers, (snapshot) => {
      const u = snapshot.docs.map(doc => doc.data() as UserProfile);
      setConstructors(u);
    });

    return () => {
      unsubscribe();
      unsubscribeUsers();
    };
  }, [profile, filterType]);

  if (loading) return <div>Carregando obras...</div>;

  const getTitle = () => {
    switch(filterType) {
      case 'public': return 'Obras Públicas';
      case 'owner': return 'Obras Solicitadas';
      case 'all': return 'Gestão de Obras';
      default: return 'Minhas Obras';
    }
  };

  const getSubtitle = () => {
    switch(filterType) {
      case 'public': return 'Projetos partilhados com a comunidade.';
      case 'owner': return 'Projetos que você solicitou.';
      case 'all': return 'Visão geral de todas as obras no sistema.';
      default: return 'Projetos onde você é o construtor.';
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="space-y-8"
    >
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-4xl font-black uppercase italic mb-2">{getTitle()}</h2>
          <p className="text-gray-600 font-medium">{getSubtitle()}</p>
        </div>
        {filterType === 'owner' && (profile?.role === 'owner' || profile?.role === 'admin') && (
          <Button onClick={() => setShowForm(true)} className="sm:w-auto">
            <Plus className="w-5 h-5" /> Nova Obra
          </Button>
        )}
      </header>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
        <div className="xl:col-span-2 space-y-4">
          {works.length === 0 ? (
            <Card className="text-center py-12">
              <Construction className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <p className="font-bold text-xl text-gray-400 uppercase italic">Nenhuma obra encontrada</p>
            </Card>
          ) : (
            works.map(work => (
              <div 
                key={work.id}
                onClick={() => setSelectedWork(work)}
                className={cn(
                  'bg-white border-4 border-black p-4 cursor-pointer transition-all hover:translate-x-1 hover:-translate-y-1 hover:shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] flex flex-col sm:flex-row items-start sm:items-center gap-4',
                  selectedWork?.id === work.id ? 'border-[#FFD700] shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]' : 'shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]'
                )}
              >
                <div className="bg-[#FFD700] p-3 border-2 border-black">
                  <HardHat className="w-6 h-6" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="font-black uppercase text-lg truncate max-w-[200px]">{work.location}</h4>
                    <Badge status={work.status}>{work.status}</Badge>
                  </div>
                  <p className="text-sm text-gray-500 line-clamp-1">{work.details}</p>
                </div>
                <div className="text-right hidden sm:block">
                  <div className="text-xs font-black uppercase text-gray-400">Dono</div>
                  <div className="font-bold text-sm">{work.ownerName}</div>
                </div>
                <ChevronRight className="w-6 h-6 text-gray-300" />
              </div>
            ))
          )}
        </div>

        <div className="space-y-8">
          {selectedWork ? (
            <WorkDetailView work={selectedWork} onClose={() => setSelectedWork(null)} constructors={constructors} />
          ) : (
            <Card title="Detalhes" icon={ClipboardList}>
              <p className="text-gray-400 text-center py-10 font-bold uppercase italic">Selecione uma obra para ver os detalhes</p>
            </Card>
          )}
        </div>
      </div>

      {showForm && (
        <WorkFormModal 
          onClose={() => setShowForm(false)} 
          constructors={constructors}
        />
      )}
    </motion.div>
  );
}

function WorkFormModal({ onClose, constructors }: { onClose: () => void, constructors: UserProfile[] }) {
  const { profile } = useAuth();
  const [formData, setFormData] = useState({
    location: '',
    details: '',
    costs: 0,
    materials: '',
    startDate: '',
    endDate: '',
    constructorUid: '',
    isPublic: false,
  });
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setSubmitting(true);
    try {
      const constructor = constructors.find(c => c.uid === formData.constructorUid);
      await addDoc(collection(db, 'works'), {
        ...formData,
        ownerUid: profile.uid,
        ownerName: profile.displayName,
        constructorName: constructor?.displayName || 'Não atribuído',
        status: 'pending',
        createdAt: serverTimestamp(),
        comments: []
      });
      onClose();
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'works');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-start sm:items-center justify-center p-4 z-50 overflow-y-auto">
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="max-w-2xl w-full my-auto"
      >
        <Card title="Nova Obra" icon={Plus} className="max-h-full">
          <div className="max-h-[80vh] overflow-y-auto pr-2 custom-scrollbar">
            <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="block text-xs font-black uppercase">Localização *</label>
                <input 
                  required
                  className="w-full p-3 border-2 border-black focus:bg-yellow-50 outline-none"
                  value={formData.location}
                  onChange={e => setFormData({ ...formData, location: e.target.value })}
                  placeholder="Ex: Rua das Flores, 123"
                />
              </div>
              <div className="space-y-2">
                <label className="block text-xs font-black uppercase">Construtor</label>
                <select 
                  className="w-full p-3 border-2 border-black focus:bg-yellow-50 outline-none"
                  value={formData.constructorUid}
                  onChange={e => setFormData({ ...formData, constructorUid: e.target.value })}
                >
                  <option value="">Selecione um construtor</option>
                  {constructors.map(c => (
                    <option key={c.uid} value={c.uid}>{c.displayName}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-black uppercase">Detalhes da Obra *</label>
              <textarea 
                required
                rows={3}
                className="w-full p-3 border-2 border-black focus:bg-yellow-50 outline-none"
                value={formData.details}
                onChange={e => setFormData({ ...formData, details: e.target.value })}
                placeholder="O que precisa de ser feito?"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="block text-xs font-black uppercase">Custos Estimados (€)</label>
                <input 
                  type="number"
                  className="w-full p-3 border-2 border-black focus:bg-yellow-50 outline-none"
                  value={formData.costs}
                  onChange={e => setFormData({ ...formData, costs: Number(e.target.value) })}
                />
              </div>
              <div className="space-y-2">
                <label className="block text-xs font-black uppercase">Materiais</label>
                <input 
                  className="w-full p-3 border-2 border-black focus:bg-yellow-50 outline-none"
                  value={formData.materials}
                  onChange={e => setFormData({ ...formData, materials: e.target.value })}
                  placeholder="Cimento, Tijolos, etc."
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="block text-xs font-black uppercase">Início Estimado</label>
                <input 
                  type="date"
                  className="w-full p-3 border-2 border-black focus:bg-yellow-50 outline-none"
                  value={formData.startDate}
                  onChange={e => setFormData({ ...formData, startDate: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <label className="block text-xs font-black uppercase">Fim Estimado</label>
                <input 
                  type="date"
                  className="w-full p-3 border-2 border-black focus:bg-yellow-50 outline-none"
                  value={formData.endDate}
                  onChange={e => setFormData({ ...formData, endDate: e.target.value })}
                />
              </div>
            </div>

            <div className="flex items-center gap-3 p-3 bg-gray-50 border-2 border-black">
              <input 
                type="checkbox"
                id="isPublic"
                className="w-5 h-5 accent-[#FFD700]"
                checked={formData.isPublic}
                onChange={e => setFormData({ ...formData, isPublic: e.target.checked })}
              />
              <label htmlFor="isPublic" className="font-black uppercase text-sm cursor-pointer">Obra Pública (visível para todos)</label>
            </div>

              <div className="flex gap-4 pt-4 sticky bottom-0 bg-white pb-2">
                <Button type="button" variant="outline" className="flex-1" onClick={onClose}>Cancelar</Button>
                <Button type="submit" className="flex-1" disabled={submitting}>
                  {submitting ? 'A criar...' : 'Criar Obra'}
                </Button>
              </div>
            </form>
          </div>
        </Card>
      </motion.div>
    </div>
  );
}

function WorkDetailView({ work, onClose, constructors }: { work: Work, onClose: () => void, constructors: UserProfile[] }) {
  const { profile } = useAuth();
  const [comment, setComment] = useState('');
  const [updating, setUpdating] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState({
    location: work.location,
    details: work.details,
    costs: work.costs || 0,
    materials: work.materials || '',
    startDate: work.startDate || '',
    endDate: work.endDate || '',
    constructorUid: work.constructorUid || '',
    status: work.status,
    isPublic: work.isPublic || false
  });

  const isAdmin = profile?.role === 'admin';

  useEffect(() => {
    setEditData({
      location: work.location,
      details: work.details,
      costs: work.costs || 0,
      materials: work.materials || '',
      startDate: work.startDate || '',
      endDate: work.endDate || '',
      constructorUid: work.constructorUid || '',
      status: work.status,
      isPublic: work.isPublic || false
    });
    setIsEditing(false);
  }, [work]);

  const handleStatusChange = async (newStatus: Work['status'], extraUpdates: Partial<Work> = {}) => {
    setUpdating(true);
    try {
      await updateDoc(doc(db, 'works', work.id), { status: newStatus, ...extraUpdates });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `works/${work.id}`);
    } finally {
      setUpdating(false);
    }
  };

  const handleSaveEdit = async () => {
    setUpdating(true);
    try {
      const constructor = constructors.find(c => c.uid === editData.constructorUid);
      await updateDoc(doc(db, 'works', work.id), {
        ...editData,
        constructorName: constructor?.displayName || 'Não atribuído'
      });
      setIsEditing(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `works/${work.id}`);
    } finally {
      setUpdating(false);
    }
  };

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!comment.trim() || !profile) return;
    try {
      const newComment: Comment = {
        uid: profile.uid,
        displayName: profile.displayName,
        text: comment,
        timestamp: new Date().toISOString()
      };
      await updateDoc(doc(db, 'works', work.id), {
        comments: [...(work.comments || []), newComment]
      });
      setComment('');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `works/${work.id}`);
    }
  };

  const isConstructor = profile?.uid === work.constructorUid;
  const isOwner = profile?.uid === work.ownerUid;
  const canEdit = isAdmin || isOwner || isConstructor;

  return (
    <Card className="sticky top-6" title={isEditing ? "Editar Obra" : "Detalhes da Obra"} icon={ClipboardList}>
      <div className="space-y-6">
        <div className="flex justify-between items-start">
          <div className="flex-1">
            {isEditing ? (
              <input 
                className="w-full p-2 border-2 border-black font-black uppercase italic text-xl mb-2"
                value={editData.location}
                onChange={e => setEditData({...editData, location: e.target.value})}
              />
            ) : (
              <h3 className="text-2xl font-black uppercase italic">{work.location}</h3>
            )}
            <Badge status={isEditing ? editData.status : work.status}>{isEditing ? editData.status : work.status}</Badge>
          </div>
          <div className="flex gap-2">
            {canEdit && !isEditing && (
              <Button variant="outline" className="p-2" onClick={() => setIsEditing(true)}>
                <Settings className="w-5 h-5" />
              </Button>
            )}
            <button onClick={onClose} className="p-1 hover:bg-gray-100 border-2 border-transparent hover:border-black">
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div className="space-y-1">
            <div className="text-xs font-black uppercase text-gray-400 flex items-center gap-1"><UserIcon className="w-3 h-3" /> Dono</div>
            <div className="font-bold">{work.ownerName}</div>
          </div>
          <div className="space-y-1">
            <div className="text-xs font-black uppercase text-gray-400 flex items-center gap-1"><HardHat className="w-3 h-3" /> Construtor</div>
            {isEditing ? (
              <select 
                className="w-full p-1 border-2 border-black font-bold text-xs"
                value={editData.constructorUid}
                onChange={e => setEditData({...editData, constructorUid: e.target.value})}
              >
                <option value="">Não atribuído</option>
                {constructors.map(c => <option key={c.uid} value={c.uid}>{c.displayName}</option>)}
              </select>
            ) : (
              <div className="font-bold">{work.constructorName || 'Não atribuído'}</div>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <div className="text-xs font-black uppercase text-gray-400 flex items-center gap-1"><AlertCircle className="w-3 h-3" /> Detalhes</div>
          {isEditing ? (
            <textarea 
              className="w-full p-2 border-2 border-black text-sm italic"
              rows={3}
              value={editData.details}
              onChange={e => setEditData({...editData, details: e.target.value})}
            />
          ) : (
            <p className="text-sm bg-gray-50 p-3 border-2 border-black italic">{work.details}</p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div className="space-y-1">
            <div className="text-xs font-black uppercase text-gray-400 flex items-center gap-1"><DollarSign className="w-3 h-3" /> Custos</div>
            {isEditing ? (
              <input 
                type="number"
                className="w-full p-1 border-2 border-black font-bold"
                value={editData.costs}
                onChange={e => setEditData({...editData, costs: Number(e.target.value)})}
              />
            ) : (
              <div className="font-bold">{work.costs ? `${work.costs}€` : 'N/A'}</div>
            )}
          </div>
          <div className="space-y-1">
            <div className="text-xs font-black uppercase text-gray-400 flex items-center gap-1"><Package className="w-3 h-3" /> Materiais</div>
            {isEditing ? (
              <input 
                className="w-full p-1 border-2 border-black font-bold"
                value={editData.materials}
                onChange={e => setEditData({...editData, materials: e.target.value})}
              />
            ) : (
              <div className="font-bold">{work.materials || 'N/A'}</div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div className="space-y-1">
            <div className="text-xs font-black uppercase text-gray-400 flex items-center gap-1"><Clock className="w-3 h-3" /> Início</div>
            {isEditing ? (
              <input 
                type="date"
                className="w-full p-1 border-2 border-black font-bold"
                value={editData.startDate}
                onChange={e => setEditData({...editData, startDate: e.target.value})}
              />
            ) : (
              <div className="font-bold">{work.startDate ? format(new Date(work.startDate), 'dd/MM/yyyy') : 'N/A'}</div>
            )}
          </div>
          <div className="space-y-1">
            <div className="text-xs font-black uppercase text-gray-400 flex items-center gap-1"><Clock className="w-3 h-3" /> Fim</div>
            {isEditing ? (
              <input 
                type="date"
                className="w-full p-1 border-2 border-black font-bold"
                value={editData.endDate}
                onChange={e => setEditData({...editData, endDate: e.target.value})}
              />
            ) : (
              <div className="font-bold">{work.endDate ? format(new Date(work.endDate), 'dd/MM/yyyy') : 'N/A'}</div>
            )}
          </div>
        </div>

        {isEditing && (
          <div className="space-y-4">
            <div className="space-y-1">
              <div className="text-xs font-black uppercase text-gray-400">Estado</div>
              <select 
                className="w-full p-2 border-2 border-black font-bold uppercase text-xs"
                value={editData.status}
                onChange={e => setEditData({...editData, status: e.target.value as Work['status']})}
              >
                <option value="pending">Pendente</option>
                <option value="accepted">Aceite</option>
                <option value="in-progress">Em Execução</option>
                <option value="completed">Terminada</option>
                <option value="cancelled">Cancelada</option>
              </select>
            </div>

            <div className="flex items-center gap-3 p-3 bg-gray-50 border-2 border-black">
              <input 
                type="checkbox"
                id="editIsPublic"
                className="w-5 h-5 accent-[#FFD700]"
                checked={editData.isPublic}
                onChange={e => setEditData({ ...editData, isPublic: e.target.checked })}
              />
              <label htmlFor="editIsPublic" className="font-black uppercase text-sm cursor-pointer">Obra Pública</label>
            </div>
          </div>
        )}

        {isEditing ? (
          <div className="flex gap-2 pt-4">
            <Button variant="outline" className="flex-1" onClick={() => setIsEditing(false)}>Cancelar Edição</Button>
            <Button className="flex-1" onClick={handleSaveEdit} disabled={updating}>Salvar</Button>
            {(isAdmin || isOwner) && work.status !== 'cancelled' && (
              <Button variant="danger" className="flex-1" onClick={() => handleStatusChange('cancelled')} disabled={updating}>Cancelar Obra</Button>
            )}
          </div>
        ) : (
          /* Actions */
          (isConstructor || isAdmin || isOwner) && (
            <div className="pt-4 border-t-2 border-black space-y-3">
              <div className="flex justify-between items-center mb-2">
                <div className="text-xs font-black uppercase">Ações Rápidas</div>
                {(isAdmin || isOwner) && work.status !== 'cancelled' && (
                  <button 
                    onClick={() => handleStatusChange('cancelled')}
                    className="text-[10px] font-black uppercase text-red-600 hover:underline flex items-center gap-1"
                  >
                    <X className="w-3 h-3" /> Cancelar Obra
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                {work.status === 'pending' && (
                  <>
                    <Button variant="primary" className="text-xs" onClick={() => handleStatusChange('accepted')} disabled={updating}>Aceitar</Button>
                    {(isAdmin || isOwner || isConstructor) && (
                      <Button variant="danger" className="text-xs" onClick={() => handleStatusChange('cancelled')} disabled={updating}>Recusar</Button>
                    )}
                  </>
                )}
                {work.status === 'accepted' && (
                  <Button variant="primary" className="col-span-2 text-xs" onClick={() => handleStatusChange('in-progress')} disabled={updating}>Iniciar Obra</Button>
                )}
                {work.status === 'in-progress' && (
                  <Button variant="secondary" className="col-span-2 text-xs" onClick={() => handleStatusChange('completed')} disabled={updating}>Terminar Obra</Button>
                )}
              </div>
            </div>
          )
        )}

        {/* Comments */}
        <div className="pt-4 border-t-2 border-black space-y-4">
          <div className="text-xs font-black uppercase flex items-center gap-2"><MessageSquare className="w-4 h-4" /> Comentários</div>
          <div className="max-h-48 overflow-y-auto space-y-3 pr-2">
            {work.comments?.length === 0 ? (
              <p className="text-xs text-gray-400 italic">Sem comentários ainda.</p>
            ) : (
              work.comments?.map((c, i) => (
                <div key={i} className="bg-gray-50 p-2 border border-black text-xs">
                  <div className="flex justify-between mb-1">
                    <span className="font-black uppercase">{c.displayName}</span>
                    <span className="text-[10px] text-gray-400">{format(new Date(c.timestamp), 'dd/MM HH:mm')}</span>
                  </div>
                  <p>{c.text}</p>
                </div>
              ))
            )}
          </div>
          <form onSubmit={handleAddComment} className="flex gap-2">
            <input 
              className="flex-1 p-2 border-2 border-black text-sm outline-none focus:bg-yellow-50"
              placeholder="Adicionar nota..."
              value={comment}
              onChange={e => setComment(e.target.value)}
            />
            <Button type="submit" className="p-2"><Check className="w-4 h-4" /></Button>
          </form>
        </div>
      </div>
    </Card>
  );
}

function AdminView() {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [adminTab, setAdminTab] = useState<'users' | 'works'>('users');

  useEffect(() => {
    const q = query(collection(db, 'users'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const u = snapshot.docs.map(doc => doc.data() as UserProfile);
      setUsers(u);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const handleRoleChange = async (uid: string, newRole: UserRole) => {
    try {
      await updateDoc(doc(db, 'users', uid), { role: newRole });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${uid}`);
    }
  };

  const handleDeleteUser = async (uid: string) => {
    if (!confirm('Tem a certeza que deseja apagar este utilizador? Esta ação é irreversível.')) return;
    try {
      await deleteDoc(doc(db, 'users', uid));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `users/${uid}`);
    }
  };

  if (loading) return <div>Carregando dados de administração...</div>;

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="space-y-8"
    >
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-4xl font-black uppercase italic mb-2">Administração</h2>
          <p className="text-gray-600 font-medium">Gestão total do sistema Bob o Construtor.</p>
        </div>
        <div className="flex gap-2 bg-black p-1 border-2 border-black">
          <button 
            onClick={() => setAdminTab('users')}
            className={cn(
              "px-4 py-2 font-black uppercase text-xs transition-all",
              adminTab === 'users' ? "bg-[#FFD700] text-black" : "text-white hover:bg-white/10"
            )}
          >
            Utilizadores
          </button>
          <button 
            onClick={() => setAdminTab('works')}
            className={cn(
              "px-4 py-2 font-black uppercase text-xs transition-all",
              adminTab === 'works' ? "bg-[#FFD700] text-black" : "text-white hover:bg-white/10"
            )}
          >
            Obras
          </button>
        </div>
      </header>

      {adminTab === 'users' ? (
        <Card title="Gestão de Utilizadores" icon={UserIcon}>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b-4 border-black">
                  <th className="p-4 font-black uppercase text-sm">Nome</th>
                  <th className="p-4 font-black uppercase text-sm">Email</th>
                  <th className="p-4 font-black uppercase text-sm">Função</th>
                  <th className="p-4 font-black uppercase text-sm">Ações</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.uid} className="border-b-2 border-gray-100 hover:bg-gray-50">
                    <td className="p-4 font-bold">{u.displayName}</td>
                    <td className="p-4 text-sm text-gray-600">{u.email}</td>
                    <td className="p-4">
                      <select 
                        className="p-2 border-2 border-black font-bold text-xs uppercase outline-none focus:bg-[#FFD700]"
                        value={u.role}
                        onChange={e => handleRoleChange(u.uid, e.target.value as UserRole)}
                        disabled={u.email === 'rui.marques.pires@gmail.com'}
                      >
                        <option value="owner">Dono de Obra</option>
                        <option value="constructor">Construtor</option>
                        <option value="admin">Administrador</option>
                      </select>
                    </td>
                    <td className="p-4">
                      <button 
                        onClick={() => handleDeleteUser(u.uid)}
                        disabled={u.email === 'rui.marques.pires@gmail.com'}
                        className="p-2 text-red-600 hover:bg-red-50 border-2 border-transparent hover:border-red-600 disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        <WorksView filterType="all" />
      )}
    </motion.div>
  );
}

function CalendarView() {
  const { profile } = useAuth();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [works, setWorks] = useState<Work[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'my' | 'requested' | 'all'>('my');

  useEffect(() => {
    if (!profile) return;
    setLoading(true);
    let q;
    
    if (filter === 'all') {
      if (profile.role === 'admin') {
        q = query(collection(db, 'works'));
      } else {
        q = query(
          collection(db, 'works'),
          or(
            where('ownerUid', '==', profile.uid),
            where('constructorUid', '==', profile.uid)
          )
        );
      }
    } else if (filter === 'requested') {
      q = query(collection(db, 'works'), where('ownerUid', '==', profile.uid));
    } else {
      // 'my' (constructor)
      q = query(collection(db, 'works'), where('constructorUid', '==', profile.uid));
    }

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const w = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Work));
      setWorks(w);
      setLoading(false);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'works'));
    return unsubscribe;
  }, [profile, filter]);

  const renderHeader = () => {
    return (
      <div className="space-y-4 mb-8">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-black text-white p-6 border-4 border-black shadow-[8px_8px_0px_0px_rgba(255,215,0,1)]">
          <h2 className="text-3xl font-black uppercase italic tracking-tighter">
            {format(currentMonth, 'MMMM yyyy')}
          </h2>
          <div className="flex gap-4">
            <button 
              onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
              className="p-2 bg-[#FFD700] text-black border-2 border-black hover:translate-x-[-2px] hover:translate-y-[-2px] shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:shadow-none active:translate-x-0 active:translate-y-0 transition-all"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>
            <button 
              onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
              className="p-2 bg-[#FFD700] text-black border-2 border-black hover:translate-x-[-2px] hover:translate-y-[-2px] shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:shadow-none active:translate-x-0 active:translate-y-0 transition-all"
            >
              <ChevronRight className="w-6 h-6" />
            </button>
          </div>
        </div>

        <div className="flex gap-2 bg-black p-1 border-2 border-black self-start w-fit">
          <button 
            onClick={() => setFilter('my')}
            className={cn(
              "px-4 py-2 font-black uppercase text-[10px] sm:text-xs transition-all",
              filter === 'my' ? "bg-[#FFD700] text-black" : "text-white hover:bg-white/10"
            )}
          >
            Minhas Obras
          </button>
          <button 
            onClick={() => setFilter('requested')}
            className={cn(
              "px-4 py-2 font-black uppercase text-[10px] sm:text-xs transition-all",
              filter === 'requested' ? "bg-[#FFD700] text-black" : "text-white hover:bg-white/10"
            )}
          >
            Solicitadas
          </button>
          <button 
            onClick={() => setFilter('all')}
            className={cn(
              "px-4 py-2 font-black uppercase text-[10px] sm:text-xs transition-all",
              filter === 'all' ? "bg-[#FFD700] text-black" : "text-white hover:bg-white/10"
            )}
          >
            Todas
          </button>
        </div>
      </div>
    );
  };

  const renderDays = () => {
    const days = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    return (
      <div className="grid grid-cols-7 mb-2">
        {days.map(day => (
          <div key={day} className="text-center font-black uppercase text-xs text-gray-500 py-2">
            {day}
          </div>
        ))}
      </div>
    );
  };

  const renderCells = () => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(monthStart);
    const startDate = startOfWeek(monthStart);
    const endDate = endOfWeek(monthEnd);

    const rows = [];
    let days = [];
    let day = startDate;

    while (day <= endDate) {
      for (let i = 0; i < 7; i++) {
        const formattedDate = format(day, 'd');
        const cloneDay = day;
        
        const dayWorks = works.filter(w => {
          if (!w.startDate || !w.endDate) return false;
          try {
            const start = parseISO(w.startDate);
            const end = parseISO(w.endDate);
            return isWithinInterval(cloneDay, { start, end }) || isSameDay(cloneDay, start) || isSameDay(cloneDay, end);
          } catch (e) {
            return false;
          }
        });

        days.push(
          <div
            key={day.toString()}
            className={cn(
              "min-h-[120px] border-2 border-black p-2 transition-all flex flex-col gap-1",
              !isSameMonth(day, monthStart) ? "bg-gray-100 opacity-50" : "bg-white",
              isSameDay(day, new Date()) ? "ring-4 ring-[#FFD700] ring-inset" : ""
            )}
          >
            <span className={cn(
              "text-sm font-black",
              isSameDay(day, new Date()) ? "bg-black text-white px-2 py-0.5 inline-block" : ""
            )}>
              {formattedDate}
            </span>
            <div className="flex flex-col gap-1 overflow-y-auto max-h-[80px] scrollbar-hide">
              {dayWorks.map(w => (
                <div 
                  key={w.id} 
                  className={cn(
                    "text-[10px] font-bold p-1 border border-black truncate leading-tight",
                    w.status === 'completed' ? 'bg-green-200' : 
                    w.status === 'in-progress' ? 'bg-yellow-200' : 'bg-blue-200'
                  )}
                  title={`${w.location}: ${w.details}`}
                >
                  {w.location}
                </div>
              ))}
            </div>
          </div>
        );
        day = new Date(day.getTime() + 24 * 60 * 60 * 1000);
      }
      rows.push(
        <div className="grid grid-cols-7" key={day.toString()}>
          {days}
        </div>
      );
      days = [];
    }
    return <div className="border-2 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">{rows}</div>;
  };

  if (loading) return <div>Carregando calendário...</div>;

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-6xl mx-auto"
    >
      <header className="mb-8">
        <h2 className="text-4xl font-black uppercase italic mb-2">Calendário de Obras</h2>
        <p className="text-gray-600 font-medium">Visualize o cronograma de todos os projetos.</p>
      </header>
      
      {renderHeader()}
      {renderDays()}
      {renderCells()}

      <div className="mt-8 flex gap-6 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-blue-200 border border-black"></div>
          <span className="text-xs font-bold uppercase">Pendente/Aceite</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-yellow-200 border border-black"></div>
          <span className="text-xs font-bold uppercase">Em Execução</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-green-200 border border-black"></div>
          <span className="text-xs font-bold uppercase">Terminada</span>
        </div>
      </div>
    </motion.div>
  );
}
