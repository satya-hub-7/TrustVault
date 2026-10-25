import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { ClerkProvider, SignIn, SignUp, useClerk, useUser } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { setBaseUrl } from "@workspace/api-client-react";
import { shadcn } from '@clerk/themes';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { Link, Redirect, Route, Router as WouterRouter, Switch, useLocation } from 'wouter';
import {
  Activity, ArrowDownToLine, ArrowLeft, ArrowRight, BadgeCheck, BriefcaseBusiness, Check,
  ChevronDown, CircleAlert, FileCheck2, FileText, Fingerprint, FolderClosed,
  Gauge, KeyRound, LockKeyhole, LogOut, Plus, Search, Shield,
  ShieldCheck, Trash2, Upload, UserRound, Users, X,
} from 'lucide-react';
import {
  getDownloadDocumentQueryKey, getGetCurrentUserQueryKey, getGetDashboardSummaryQueryKey, getGetDocumentQueryKey,
  getHealthCheckQueryKey, getListAuditEventsQueryKey, getListDocumentPermissionsQueryKey,
  getListDocumentsQueryKey, getListSharedDocumentsQueryKey, getListUsersQueryKey,
  useCompleteDocumentUpload, useCreateDocument, useDeleteDocument, useDownloadDocument,
  useGetCurrentUser, useGetDashboardSummary, useGetDocument, useHealthCheck,
  useListAuditEvents, useListDocumentPermissions, useListDocuments, useListSharedDocuments,
  useListUsers, useRevokeDocumentPermission, useShareDocument, useUpdateUserRole,
} from '@workspace/api-client-react';
import type { AuditEvent, Document, Permission, SharedDocument, User } from '@workspace/api-client-react';
import { ErrorBoundary } from '@/components/error-boundary';
import NotFound from '@/pages/not-found';
import './index.css';

setBaseUrl(
  import.meta.env.VITE_API_BASE_URL ||
  "https://trustvault-6q4l.onrender.com"
);

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } } });
const clerkPubKey = publishableKeyFromHost(window.location.hostname, import.meta.env.VITE_CLERK_PUBLISHABLE_KEY);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
function stripBase(path: string) { return basePath && path.startsWith(basePath) ? path.slice(basePath.length) || '/' : path; }
if (!clerkPubKey) throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY in .env file');

const clerkAppearance = {
  theme: shadcn, cssLayerName: 'clerk',
  options: { logoPlacement: 'inside' as const, logoLinkUrl: basePath || '/', logoImageUrl: `${window.location.origin}${basePath}/logo.svg` },
  variables: { colorPrimary: '#321B3A', colorForeground: '#321B3A', colorMutedForeground: '#776d7b', colorDanger: '#a94442', colorBackground: '#fafbfc', colorInput: '#f3f5f7', colorInputForeground: '#321B3A', colorNeutral: '#d9dfe5', fontFamily: 'DM Sans, sans-serif', borderRadius: '0.75rem' },
  elements: {
    rootBox: 'w-full flex justify-center', cardBox: 'bg-[#fafbfc] rounded-2xl w-[440px] max-w-full overflow-hidden border border-[#d9dfe5]',
    card: '!shadow-none !border-0 !bg-transparent !rounded-none', footer: '!shadow-none !border-0 !bg-transparent !rounded-none',
    headerTitle: 'text-[#321b3a] font-bold', headerSubtitle: 'text-[#776d7b]', socialButtonsBlockButtonText: 'text-[#321b3a] font-semibold',
    formFieldLabel: 'text-[#514257] font-semibold', footerActionLink: 'text-[#654c6d] font-bold', footerActionText: 'text-[#776d7b]',
    dividerText: 'text-[#776d7b]', identityPreviewEditButton: 'text-[#654c6d]', formFieldSuccessText: 'text-[#416d5f]',
    alertText: 'text-[#321b3a]', logoBox: 'mb-3', logoImage: 'max-h-8', socialButtonsBlockButton: 'border-[#d9dfe5] bg-[#f3f5f7]',
    formButtonPrimary: 'bg-[#321b3a] text-[#f7f5f8] hover:bg-[#472650]', formFieldInput: 'border-[#d9dfe5] text-[#321b3a]',
    footerAction: 'text-[#776d7b]', dividerLine: 'bg-[#d9dfe5]', alert: 'border-[#d9dfe5]', otpCodeFieldInput: 'border-[#d9dfe5]',
    formFieldRow: 'mb-4', main: 'gap-4',
  },
};

type NavItem = { href: string; label: string; icon: typeof Gauge };
const navItems: NavItem[] = [
  { href: '/dashboard', label: 'Overview', icon: Gauge },
  { href: '/documents', label: 'My documents', icon: FolderClosed },
  { href: '/shared', label: 'Shared with me', icon: FileCheck2 },
  { href: '/access', label: 'Access control', icon: KeyRound },
  { href: '/audit', label: 'Audit trail', icon: Activity },
];

function Brand({ inverted = false }: { inverted?: boolean }) {
  return <Link href="/" className={`brand-lockup ${inverted ? 'brand-light' : ''}`} data-testid="link-brand">
    <span className="brand-mark"><ShieldCheck size={18} strokeWidth={2.2} /></span>
    <span>trustvault<span className="brand-period">.</span></span>
  </Link>;
}
function CacheInvalidator() {
  const { addListener } = useClerk(); const client = useQueryClient(); const previous = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const unsub = addListener(({ user }) => { const id = user?.id ?? null; if (previous.current !== undefined && previous.current !== id) client.clear(); previous.current = id; });
    return unsub;
  }, [addListener, client]);
  return null;
}
function AuthPages() {
  return <Switch>
    <Route path="/sign-in/*?"><div className="auth-page"><Brand /><p className="auth-note">A safer place for the files your business depends on.</p><SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} /></div></Route>
    <Route path="/sign-up/*?"><div className="auth-page"><Brand /><p className="auth-note">Trust, documented. Access, always yours to control.</p><SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} /></div></Route>
  </Switch>;
}
function PublicHome() {
  const { isSignedIn } = useUser();
  if (isSignedIn) return <Redirect to="/dashboard" />;
  return <div className="landing tv-noise">
    <header className="landing-nav"><Brand /><div className="landing-links"><a href="#principles">Why TrustVault</a><a href="#proof">Proof, built in</a></div><div className="nav-actions"><Link href="/sign-in" className="signin-link" data-testid="link-sign-in">Sign in</Link><Link href="/sign-up" className="tv-button tv-button-gold" data-testid="link-sign-up">Create your vault <ArrowRight size={15} /></Link></div></header>
    <main>
      <section className="hero-section">
        <div className="hero-copy tv-entrance"><div className="eyebrow"><span className="eyebrow-dot" /> PRIVATE DOCUMENT WORKSPACE</div>
          <h1>Your documents.<br />Your rules.<br /><em>Your proof.</em></h1>
          <p>Share sensitive company files without giving up control. TrustVault makes every permission deliberate—and every action accountable.</p>
          <div className="hero-actions"><Link href="/sign-up" className="tv-button tv-button-gold" data-testid="button-start-vault">Start your vault <ArrowRight size={16} /></Link><Link href="/sign-in" className="text-action" data-testid="link-existing-account">I already have an account <ArrowRight size={14} /></Link></div>
          <div className="hero-assurance"><span><LockKeyhole size={15} /> Private by default</span><span><Fingerprint size={15} /> A record of every action</span></div>
        </div>
        <div className="hero-visual tv-entrance" aria-label="TrustVault access record illustration">
          <div className="visual-orbit orbit-one"></div><div className="visual-orbit orbit-two"></div><div className="visual-core"><ShieldCheck size={66} strokeWidth={1.2}/><span>CONTROL<br />CONFIRMED</span></div>
          <div className="proof-card card-top"><span className="proof-icon"><FileCheck2 size={17}/></span><span><b>Quarterly forecast.pdf</b><small>Shared with 3 people</small></span><BadgeCheck className="proof-check" size={17}/></div>
          <div className="proof-card card-bottom"><span className="proof-icon gold"><Fingerprint size={17}/></span><span><b>Access recorded</b><small>Viewed · just now</small></span><span className="live-dot"/></div>
          <div className="visual-caption"><span>01 / ACCESS WITH EVIDENCE</span><span>OWNER-CONTROLLED</span></div>
        </div>
      </section>
      <section className="trust-strip"><span>BUILT FOR THE FILES THAT MATTER</span><div><span><BriefcaseBusiness size={17}/> Finance</span><span><Users size={17}/> Leadership</span><span><Shield size={17}/> Legal &amp; compliance</span></div></section>
      <section id="principles" className="principles-section"><div className="section-intro"><span className="eyebrow">A DIFFERENT KIND OF SHARING</span><h2>Access should be<br />a decision—not a risk.</h2></div>
        <div className="principle-list"><article><div className="principle-number">01</div><div><h3>Start private. Stay in control.</h3><p>Your documents belong to you. Grant specific access to registered teammates and revoke it when the work is done.</p></div><LockKeyhole /></article><article><div className="principle-number">02</div><div><h3>Share only what’s needed.</h3><p>Choose view or download access. Keep a clear picture of who can reach each file.</p></div><KeyRound /></article><article id="proof"><div className="principle-number">03</div><div><h3>Know what happened.</h3><p>Keep a reliable trail of successful and denied activity, ready when questions come later.</p></div><Fingerprint /></article></div>
      </section>
      <section className="closing-cta"><div className="closing-seal"><ShieldCheck size={34}/></div><div><span className="eyebrow">YOUR WORK. YOUR TERMS.</span><h2>Make every share<br />a choice you can prove.</h2></div><Link href="/sign-up" className="tv-button tv-button-gold" data-testid="button-create-account">Create your TrustVault <ArrowRight size={16}/></Link></section>
    </main><footer className="landing-footer"><Brand /><span>Private access. Verifiable history.</span><span>© TrustVault</span></footer>
  </div>;
}

function Protected({ children }: { children: ReactNode }) {
  const { isSignedIn, isLoaded } = useUser();
  if (!isLoaded) return <div className="auth-loading"><div className="tv-skeleton" style={{ width: 220 }} /></div>;
  return isSignedIn ? <>{children}</> : <Redirect to="/" />;
}
function Shell({ children, title, eyebrow }: { children: ReactNode; title: string; eyebrow?: string }) {
  const [path] = useLocation(); const { user } = useUser(); const { signOut } = useClerk();
  const { data: appUser } = useGetCurrentUser({ query: { queryKey: getGetCurrentUserQueryKey() } });
  const current = path || '/dashboard';
  const { data: health } = useHealthCheck({ query: { queryKey: getHealthCheckQueryKey(), staleTime: 60000 } });
  return <div className="app-layout">
    <aside className="tv-sidebar">
      <div className="sidebar-top"><Brand inverted /></div>
      <div className="workspace-switch"><span className="workspace-symbol">V</span><span><b>Vault workspace</b><small>Company account</small></span><ChevronDown size={14}/></div>
      <div className="nav-section-label">WORKSPACE</div><nav className="tv-nav">{navItems.map(item => { const Icon = item.icon; return <Link key={item.href} href={item.href} className={`tv-nav-link ${current === item.href ? 'active' : ''}`} data-testid={`nav-${item.href.slice(1)}`}><Icon size={17}/>{item.label}</Link>; })}</nav>
      <div className="nav-section-label nav-admin-label">ACCOUNT</div><nav className="tv-nav">
        <Link href="/account" className={`tv-nav-link ${current === '/account' ? 'active' : ''}`} data-testid="nav-account"><UserRound size={17}/>Account</Link>
        {appUser?.role === 'admin' && <Link href="/admin/users" className={`tv-nav-link ${current === '/admin/users' ? 'active' : ''}`} data-testid="nav-admin-users"><Users size={17}/>People &amp; roles</Link>}
      </nav>
      <div className="sidebar-bottom"><div className="secure-status"><span className={`status-pulse ${health?.status === 'ok' ? '' : 'is-quiet'}`}/><span>{health?.status === 'ok' ? 'Vault operational' : 'Secure workspace'}</span></div><div className="profile-mini"><div className="initial-avatar">{user?.firstName?.[0] || user?.emailAddresses[0]?.emailAddress[0]?.toUpperCase() || 'U'}</div><div className="profile-mini-copy"><b>{user?.fullName || 'Account'}</b><small>{user?.primaryEmailAddress?.emailAddress}</small></div><button aria-label="Sign out" className="icon-button sidebar-signout" onClick={() => signOut({ redirectUrl: basePath || '/' })} data-testid="button-sign-out"><LogOut size={16}/></button></div></div>
    </aside>
    <section className="tv-main"><header className="app-header"><div className="breadcrumb"><span>TrustVault</span><ArrowRight size={13}/><b>{title}</b></div><div className="header-right"><div className="header-security"><span className="secure-tiny"><ShieldCheck size={15}/></span><span>{eyebrow || 'Protected workspace'}</span></div><div className="header-avatar">{user?.firstName?.[0] || 'U'}</div></div></header><main className="page-content tv-entrance">{children}</main></section>
  </div>;
}
function Heading({ kicker, title, description, action }: { kicker: string; title: string; description?: string; action?: ReactNode }) {
  return <div className="page-heading"><div><div className="page-kicker">{kicker}</div><h1>{title}</h1>{description && <p>{description}</p>}</div>{action && <div className="heading-action">{action}</div>}</div>;
}
function LoadingRows({ count = 4 }: { count?: number }) { return <div className="tv-card loading-card">{Array.from({ length: count }, (_, i) => <div className="loading-row" key={i}><div className="tv-skeleton" style={{ width: '38%' }}/><div className="tv-skeleton" style={{ width: '18%' }}/><div className="tv-skeleton" style={{ width: '24%' }}/></div>)}</div>; }
function QueryMessage({ error, retry }: { error: boolean; retry: () => void }) { return <div className={`state-panel ${error ? 'error-state' : ''}`}><div className="state-icon">{error ? <CircleAlert size={20}/> : <FolderClosed size={20}/>}</div><b>{error ? 'We couldn’t load this view' : 'Nothing here yet'}</b><p>{error ? 'Your information is still protected. Try again in a moment.' : 'When there is activity here, you’ll find a clear record of it.'}</p>{error && <button className="tv-button tv-button-quiet" onClick={retry} data-testid="button-retry">Try again</button>}</div>; }
function formatBytes(bytes: number) { return bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(0)} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`; }
function formatDate(value: string) { const d = new Date(value); return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }); }
function DocStatus({ status }: { status: string }) { return <span className={`tv-pill ${status === 'active' ? 'pill-active' : 'pill-pending'}`}><span/> {status}</span>; }
function DocumentDetails({ id, close, canDelete = true }: { id: string; close: () => void; canDelete?: boolean }) {
  const { data, isLoading, isError, refetch } = useGetDocument(id, { query: { queryKey: getGetDocumentQueryKey(id) } });
  const queryClient = useQueryClient(); const del = useDeleteDocument();
  return <div className="modal-scrim" onMouseDown={e => e.target === e.currentTarget && close()}><section className="dialog-card" role="dialog" aria-modal="true"><button className="dialog-close" onClick={close} data-testid="button-close-details"><X size={18}/></button><div className="dialog-kicker">DOCUMENT RECORD</div>{isLoading ? <LoadingRows count={2}/> : isError || !data ? <QueryMessage error retry={() => refetch()}/> : <>
    <div className="detail-file-icon"><FileText size={22}/></div><h2>{data.name}</h2><p className="detail-description">Owned by {data.ownerName}. Changes and access are recorded against this file.</p><div className="detail-facts"><span><small>STATUS</small><DocStatus status={data.status}/></span><span><small>SIZE</small><b>{formatBytes(data.sizeBytes)}</b></span><span><small>ACCESS GRANTS</small><b>{data.permissionCount}</b></span><span><small>LAST UPDATED</small><b>{formatDate(data.updatedAt)}</b></span></div>
    {canDelete && <button className="tv-button tv-button-quiet danger-action" onClick={async () => { if (!window.confirm(`Delete ${data.name}? This will remove the document and its access grants.`)) return; await del.mutateAsync({ id }); await queryClient.invalidateQueries({ queryKey: getListDocumentsQueryKey() }); await queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() }); close(); }} disabled={del.isPending} data-testid={`button-delete-document-${id}`}><Trash2 size={15}/>{del.isPending ? 'Deleting…' : 'Delete document'}</button>}
  </>}</section></div>;
}
function DownloadControl({ id, name }: { id: string; name: string }) {
  const query = useDownloadDocument(id, { query: { queryKey: getDownloadDocumentQueryKey(id), enabled: false, retry: false } });
  const [busy, setBusy] = useState(false);
  const download = async () => {
    setBusy(true);
    try { const result = await query.refetch(); if (!result.data) throw result.error || new Error('Download unavailable'); const url = URL.createObjectURL(result.data); const a = document.createElement('a'); a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url); }
    catch { window.alert('This download could not be completed. Please check your access and try again.'); }
    finally { setBusy(false); }
  };
  return <button className="icon-button action-download" title="Download document" onClick={download} disabled={busy} data-testid={`button-download-${id}`}><ArrowDownToLine size={16}/><span>{busy ? 'Working' : 'Download'}</span></button>;
}
function DocumentTable({ docs, shared = false, onInspect }: { docs: Document[] | SharedDocument[]; shared?: boolean; onInspect: (id: string) => void }) {
  return <div className="tv-card tv-table-wrap"><table className="tv-table"><thead><tr><th>Document</th>{shared && <th>Shared by</th>}<th>Access</th><th>Last updated</th><th className="table-actions-heading">Action</th></tr></thead><tbody>{docs.map(doc => <tr key={doc.id} data-testid={`row-document-${doc.id}`}><td><button className="document-name-button" onClick={() => onInspect(doc.id)} data-testid={`button-inspect-${doc.id}`}><span className="document-icon"><FileText size={17}/></span><span><b>{doc.name}</b><small>{formatBytes(doc.sizeBytes)} · {doc.contentType}</small></span></button></td>{shared && <td>{(doc as SharedDocument).ownerName}</td>}<td>{shared ? <span className="access-label"><KeyRound size={13}/>{(doc as SharedDocument).accessLevel}</span> : <DocStatus status={doc.status}/>}</td><td>{formatDate(doc.updatedAt)}</td><td>{!shared || (doc as SharedDocument).accessLevel === 'download' ? <DownloadControl id={doc.id} name={doc.name}/> : <span className="view-only-label">View only</span>}</td></tr>)}</tbody></table></div>;
}
function Dashboard() {
  const { data, isLoading, isError, refetch } = useGetDashboardSummary({ query: { queryKey: getGetDashboardSummaryQueryKey() } });
  const [, setPath] = useLocation();
  return <Shell title="Overview" eyebrow="Live activity">
    <Heading kicker="YOUR SPACE, AT A GLANCE" title="Good to see you." description="A clear view of your documents, access, and recent activity." action={<Link href="/documents" className="tv-button tv-button-primary" data-testid="button-add-document"><Plus size={16}/>Add a document</Link>}/>
    {isLoading ? <><div className="metrics-grid">{[1,2,3].map(x => <div className="tv-card metric-card" key={x}><div className="tv-skeleton" style={{width:90}}/><div className="tv-skeleton metric-skeleton"/></div>)}</div><LoadingRows/></> : isError || !data ? <QueryMessage error retry={() => refetch()}/> : <>
      <div className="metrics-grid">
        <div className="tv-card metric-card metric-featured"><div className="metric-top"><span>YOUR DOCUMENTS</span><FolderClosed size={17}/></div><strong data-testid="value-owned-documents">{data.ownedDocuments}</strong><small>owned by you</small><Link href="/documents" className="metric-link">View documents <ArrowRight size={13}/></Link></div>
        <div className="tv-card metric-card"><div className="metric-top"><span>SHARED WITH YOU</span><FileCheck2 size={17}/></div><strong data-testid="value-shared-documents">{data.sharedWithMe}</strong><small>available to your account</small><Link href="/shared" className="metric-link">Open shared files <ArrowRight size={13}/></Link></div>
        <div className="tv-card metric-card"><div className="metric-top"><span>ACTIVE PERMISSIONS</span><KeyRound size={17}/></div><strong data-testid="value-active-permissions">{data.activePermissions}</strong><small>grants you currently control</small><Link href="/access" className="metric-link">Review access <ArrowRight size={13}/></Link></div>
      </div>
      <section className="dashboard-lower"><div className="tv-card activity-card"><div className="panel-heading"><div><div className="panel-kicker">ACCOUNTABILITY</div><h2>Recent activity</h2></div><Link href="/audit" className="subtle-link" data-testid="link-full-audit">Full audit trail <ArrowRight size={14}/></Link></div>
        {data.recentEvents.length ? <div className="activity-list">{data.recentEvents.slice(0, 6).map(evt => <AuditRow key={evt.id} event={evt}/>)}</div> : <div className="activity-empty"><Fingerprint size={24}/><b>No events to report</b><span>Actions will appear here as your vault is used.</span></div>}
      </div><div className="trust-panel"><div className="trust-panel-icon"><ShieldCheck size={21}/></div><span className="panel-kicker">DESIGNED FOR TRUST</span><h2>Access is yours<br/>to grant—and revoke.</h2><p>Every permission has a person, a level, and a place in your history.</p><button className="text-action" onClick={() => setPath('/access')} data-testid="button-review-access">Review access controls <ArrowRight size={14}/></button><div className="trust-lines"><i/><i/><i/><i/><i/><i/><i/></div></div></section>
    </>}
  </Shell>;
}
function UploadDocument() {
  const client = useQueryClient(); const create = useCreateDocument(); const complete = useCompleteDocumentUpload();
  const input = useRef<HTMLInputElement>(null); const [file, setFile] = useState<File | null>(null); const [error, setError] = useState(''); const [success, setSuccess] = useState('');
  const busy = create.isPending || complete.isPending;
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setError(''); setSuccess('');
    if (!file) { setError('Choose a file before uploading.'); return; }
    if (file.size > 25 * 1024 * 1024) { setError('This file is larger than the 25 MB upload limit.'); return; }
    try {
      const contentType = file.type || 'application/octet-stream';
      const session = await create.mutateAsync({ data: { name: file.name, contentType, sizeBytes: file.size } });
      const response = await fetch(session.uploadURL, { method: 'PUT', headers: { 'Content-Type': contentType }, body: file });
      if (!response.ok) throw new Error(`Storage upload failed (${response.status})`);
      await complete.mutateAsync({ id: session.document.id, data: {} });
      await Promise.all([client.invalidateQueries({ queryKey: getListDocumentsQueryKey() }), client.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() }), client.invalidateQueries({ queryKey: getGetDocumentQueryKey(session.document.id) })]);
      setSuccess(`${file.name} is safely in your vault.`); setFile(null); if (input.current) input.current.value = '';
    } catch (e) { setError(e instanceof Error ? e.message : 'Upload could not be completed.'); }
  };
  return <div className="tv-card upload-card"><div className="panel-heading"><div><div className="panel-kicker">PRIVATE BY DEFAULT</div><h2>Add a document</h2></div><span className="upload-shield"><ShieldCheck size={19}/></span></div>
    <p>Upload a file to your private vault. You decide who can access it afterwards.</p>
    <form onSubmit={submit}><label className={`drop-zone ${file ? 'has-file' : ''}`} htmlFor="vault-file" data-testid="drop-upload-file"><span className="upload-symbol">{file ? <FileCheck2 size={22}/> : <Upload size={22}/>}</span><b>{file ? file.name : 'Choose a file to upload'}</b><small>{file ? `${formatBytes(file.size)} · ${file.type || 'File'}` : 'PDF, spreadsheets, and other files up to 25 MB'}</small><input ref={input} id="vault-file" type="file" onChange={e => { setError(''); setFile(e.target.files?.[0] || null); }} data-testid="input-document-file"/></label>
      {error && <div className="inline-alert error-alert" role="alert" data-testid="status-upload-error"><CircleAlert size={15}/>{error}</div>}{success && <div className="inline-alert success-alert" role="status" data-testid="status-upload-success"><Check size={15}/>{success}</div>}
      <button className="tv-button tv-button-primary upload-submit" disabled={!file || busy} data-testid="button-upload-document">{busy ? <><span className="mini-spinner"/>Securing document…</> : <><Upload size={15}/>Upload securely</>}</button>
    </form><div className="upload-footnote"><LockKeyhole size={13}/> Bytes are sent directly to private storage.</div>
  </div>;
}
function DocumentsPage() {
  const { data, isLoading, isError, refetch } = useListDocuments(undefined, { query: { queryKey: getListDocumentsQueryKey() } });
  const [search, setSearch] = useState(''); const [selected, setSelected] = useState<string | null>(null);
  const filtered = useMemo(() => data?.filter(d => d.name.toLowerCase().includes(search.toLowerCase())) || [], [data, search]);
  return <Shell title="My documents"><Heading kicker="OWNED BY YOU" title="My documents" description="Your private files, and the access you choose to grant."/><div className="documents-layout"><section className="documents-list-section"><div className="list-toolbar"><div><div className="panel-kicker">DOCUMENT LIBRARY</div><h2>{data?.length ?? '—'} files</h2></div><label className="search-box"><Search size={15}/><input aria-label="Search documents" placeholder="Find a document" value={search} onChange={e => setSearch(e.target.value)} data-testid="input-search-documents"/></label></div>
      {isLoading ? <LoadingRows/> : isError ? <QueryMessage error retry={() => refetch()}/> : !filtered.length ? <QueryMessage error={false} retry={() => setSearch('')}/> : <DocumentTable docs={filtered} onInspect={setSelected}/>}
    </section><UploadDocument/></div>{selected && <DocumentDetails id={selected} close={() => setSelected(null)}/>}</Shell>;
}
function SharedPage() {
  const { data, isLoading, isError, refetch } = useListSharedDocuments({ query: { queryKey: getListSharedDocumentsQueryKey() } });
  const [selected, setSelected] = useState<string | null>(null);
  return <Shell title="Shared with me"><Heading kicker="ACCESS GIVEN TO YOU" title="Shared with me" description="Files other people have deliberately shared with your account."/>
    <div className="info-banner"><span><ShieldCheck size={18}/></span><div><b>Access is specific to you</b><small>Each file shows the level of access its owner granted.</small></div></div>
    {isLoading ? <LoadingRows/> : isError ? <QueryMessage error retry={() => refetch()}/> : !data?.length ? <QueryMessage error={false} retry={() => {}}/> : <DocumentTable docs={data} shared onInspect={setSelected}/>}
    {selected && <DocumentDetails id={selected} canDelete={false} close={() => setSelected(null)}/>}</Shell>;
}
function AccessPage() {
  const client = useQueryClient(); const { data: docs, isLoading: docLoading } = useListDocuments(undefined, { query: { queryKey: getListDocumentsQueryKey() } });
  const { data: permissions, isLoading, isError, refetch } = useListDocumentPermissions({ query: { queryKey: getListDocumentPermissionsQueryKey() } });
  const share = useShareDocument(); const revoke = useRevokeDocumentPermission(); const [documentId, setDocumentId] = useState(''); const [email, setEmail] = useState(''); const [level, setLevel] = useState<'view' | 'download'>('view'); const [message, setMessage] = useState('');
  const refresh = async () => Promise.all([client.invalidateQueries({ queryKey: getListDocumentPermissionsQueryKey() }), client.invalidateQueries({ queryKey: getListDocumentsQueryKey() }), client.invalidateQueries({ queryKey: getListSharedDocumentsQueryKey() }), client.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() })]);
  const submit = async (e: FormEvent) => { e.preventDefault(); setMessage(''); if (!documentId || !email.trim()) return; try { await share.mutateAsync({ id: documentId, data: { email: email.trim(), accessLevel: level } }); await refresh(); setEmail(''); setMessage('Access granted. The new permission is now recorded.'); } catch (e) { setMessage(e instanceof Error ? e.message : 'Could not grant access. Check that the user is registered.'); } };
  const handleRevoke = async (p: Permission) => { if (!window.confirm(`Revoke ${p.userName}’s access to ${p.documentName}?`)) return; try { await revoke.mutateAsync({ permissionId: p.id }); await refresh(); setMessage('Permission revoked and recorded.'); } catch (e) { setMessage(e instanceof Error ? e.message : 'Could not revoke this permission.'); } };
  useEffect(() => { if (!documentId && docs?.length) setDocumentId(docs[0].id); }, [docs, documentId]);
  return <Shell title="Access control"><Heading kicker="OWNER-CONTROLLED SHARING" title="Access control" description="Grant the minimum access needed. Revoke it the moment it is no longer required."/>
    <div className="access-layout"><section className="tv-card grant-card"><div className="panel-heading"><div><div className="panel-kicker">NEW PERMISSION</div><h2>Share a document</h2></div><div className="grant-key"><KeyRound size={18}/></div></div><p>Only registered TrustVault users can receive access.</p>
      {docLoading ? <LoadingRows count={2}/> : !docs?.length ? <div className="state-panel compact-state"><b>Add a document first</b><p>Upload a private document before granting access.</p><Link href="/documents" className="tv-button tv-button-quiet" data-testid="link-upload-first"><Plus size={14}/>Go to documents</Link></div> : <form onSubmit={submit} className="grant-form">
        <label><span className="tv-label">DOCUMENT</span><select className="tv-field" value={documentId} onChange={e => setDocumentId(e.target.value)} data-testid="select-access-document">{docs.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
        <label><span className="tv-label">PERSON’S EMAIL</span><input type="email" className="tv-field" placeholder="colleague@company.com" value={email} onChange={e => setEmail(e.target.value)} required data-testid="input-access-email"/></label>
        <label><span className="tv-label">ACCESS LEVEL</span><select className="tv-field" value={level} onChange={e => setLevel(e.target.value as 'view'|'download')} data-testid="select-access-level"><option value="view">View only</option><option value="download">View and download</option></select></label>
        {message && <div className={`inline-alert ${message.startsWith('Could') ? 'error-alert' : 'success-alert'}`} role="status" data-testid="status-access-message">{message}</div>}
        <button type="submit" className="tv-button tv-button-primary grant-button" disabled={share.isPending || !email.trim()} data-testid="button-grant-access">{share.isPending ? 'Recording permission…' : <><Plus size={15}/>Grant access</>}</button>
      </form>}<div className="grant-note"><ShieldCheck size={14}/>Every grant and revocation is recorded.</div>
    </section><section className="permissions-section"><div className="list-toolbar"><div><div className="panel-kicker">LIVE PERMISSIONS</div><h2>Who can access your files</h2></div><span className="permission-count">{permissions?.length ?? '—'} grants</span></div>
      {isLoading ? <LoadingRows/> : isError ? <QueryMessage error retry={() => refetch()}/> : !permissions?.length ? <QueryMessage error={false} retry={() => {}}/> : <div className="tv-card tv-table-wrap"><table className="tv-table"><thead><tr><th>Person</th><th>Document</th><th>Level</th><th>Granted</th><th></th></tr></thead><tbody>{permissions.map(p => <tr key={p.id} data-testid={`row-permission-${p.id}`}><td><div className="person-cell"><span className="person-avatar">{p.userName?.[0]?.toUpperCase() || p.email[0].toUpperCase()}</span><span><b>{p.userName}</b><small>{p.email}</small></span></div></td><td>{p.documentName}</td><td><span className="access-label"><KeyRound size={13}/>{p.accessLevel}</span></td><td>{formatDate(p.createdAt)}</td><td><button className="revoke-button" onClick={() => handleRevoke(p)} disabled={revoke.isPending} data-testid={`button-revoke-${p.id}`}><X size={14}/>Revoke</button></td></tr>)}</tbody></table></div>}
    </section></div></Shell>;
}
function AuditRow({ event }: { event: AuditEvent }) {
  const okay = event.outcome === 'success';
  return <div className="activity-row" data-testid={`event-${event.id}`}><div className={`event-marker ${okay ? 'event-ok' : 'event-denied'}`}>{okay ? <Check size={13}/> : <X size={13}/>}</div><div className="event-copy"><b>{event.action.replace(/[_-]/g, ' ')}</b><span>{event.actorName} · {event.documentName || event.context || 'Account activity'}</span></div><span className={`outcome-tag ${okay ? 'outcome-success' : 'outcome-denied'}`}>{event.outcome}</span><time>{formatDate(event.createdAt)}</time></div>;
}
function AuditPage() {
  const [search, setSearch] = useState(''); const params = useMemo(() => ({ limit: 100, ...(search.trim() ? { search: search.trim() } : {}) }), [search]);
  const { data, isLoading, isError, refetch } = useListAuditEvents(params, { query: { queryKey: getListAuditEventsQueryKey(params) } });
  return <Shell title="Audit trail"><Heading kicker="A RECORD YOU CAN RETURN TO" title="Audit trail" description="Review activity tied to your account and documents. Both successful and denied actions are visible."/>
    <div className="audit-summary"><div className="audit-symbol"><Fingerprint size={22}/></div><div><b>Independent activity record</b><span>Events are returned by the secure TrustVault service; this page is read-only.</span></div><div className="audit-total">{data?.length ?? (isLoading ? '—' : 0)}<small>EVENTS</small></div></div>
    <div className="list-toolbar audit-toolbar"><div><div className="panel-kicker">RECENT EVENTS</div><h2>Activity log</h2></div><label className="search-box"><Search size={15}/><input placeholder="Search activity" value={search} onChange={e => setSearch(e.target.value)} data-testid="input-search-audit"/></label></div>
    {isLoading ? <LoadingRows/> : isError ? <QueryMessage error retry={() => refetch()}/> : !data?.length ? <QueryMessage error={false} retry={() => setSearch('')}/> : <div className="tv-card audit-list">{data.map(e => <AuditRow key={e.id} event={e}/>)}</div>}
  </Shell>;
}
function AccountPage() {
  const { user, isLoaded } = useUser(); const { data, isLoading, isError, refetch } = useGetCurrentUser({ query: { queryKey: getGetCurrentUserQueryKey() } }); const { signOut } = useClerk();
  return <Shell title="Account"><Heading kicker="YOUR IDENTITY" title="Account" description="Your signed-in identity and TrustVault role."/>
    <div className="account-grid">{isLoading || !isLoaded ? <LoadingRows/> : isError || !data ? <QueryMessage error retry={() => refetch()}/> : <><section className="tv-card account-identity"><div className="account-hero"><span className="account-avatar-large">{data.name?.[0]?.toUpperCase() || 'U'}</span><div><span className="panel-kicker">TRUSTVAULT ACCOUNT</span><h2 data-testid="text-account-name">{data.name}</h2><span>{data.email}</span></div><span className={`tv-pill account-role ${data.role === 'admin' ? 'role-admin' : ''}`}>{data.role}</span></div><div className="account-details"><div><small>FULL NAME</small><b>{data.name || user?.fullName}</b></div><div><small>EMAIL ADDRESS</small><b>{data.email || user?.primaryEmailAddress?.emailAddress}</b></div><div><small>APPLICATION ROLE</small><b>{data.role === 'admin' ? 'Administrator' : 'Member'}</b></div><div><small>ACCOUNT CREATED</small><b>{formatDate(data.createdAt)}</b></div></div><div className="identity-verified"><BadgeCheck size={17}/><span><b>Identity verified</b><small>Authenticated with Clerk</small></span></div></section><aside className="account-privacy tv-card"><div className="privacy-icon"><LockKeyhole size={21}/></div><span className="panel-kicker">ACCOUNT SECURITY</span><h2>Your access<br/>is protected.</h2><p>Signed-in identity is used to authorize your requests. Your role determines the actions available to you.</p><button className="tv-button tv-button-quiet" onClick={() => signOut({ redirectUrl: basePath || '/' })} data-testid="button-account-sign-out"><LogOut size={15}/>Sign out</button></aside></>}</div>
  </Shell>;
}
function AdminUsersPage() {
  const { data: current } = useGetCurrentUser({ query: { queryKey: getGetCurrentUserQueryKey() } });
  const { data: users, isLoading, isError, refetch } = useListUsers({ query: { queryKey: getListUsersQueryKey(), enabled: current?.role === 'admin' } });
  const mutation = useUpdateUserRole(); const client = useQueryClient(); const [notice, setNotice] = useState('');
  const changeRole = async (user: User) => { const role = user.role === 'admin' ? 'member' : 'admin'; if (!window.confirm(`Change ${user.name} to ${role}?`)) return; try { await mutation.mutateAsync({ id: user.id, data: { role } }); await client.invalidateQueries({ queryKey: getListUsersQueryKey() }); setNotice(`${user.name} is now ${role}.`); } catch { setNotice('The role could not be changed. Your account may not have administrator access.'); } };
  return <Shell title="People & roles"><Heading kicker="ADMINISTRATION" title="People &amp; roles" description="Manage the TrustVault role assigned to each registered account."/>
    {notice && <div className="inline-alert success-alert" role="status" data-testid="status-role-change">{notice}</div>}
    {current?.role !== 'admin' ? <div className="admin-denied"><Shield size={28}/><h2>Administrator access required</h2><p>This area is restricted to TrustVault administrators.</p><Link href="/dashboard" className="tv-button tv-button-quiet" data-testid="link-back-overview"><ArrowLeft size={15}/>Back to overview</Link></div>
      : isLoading ? <LoadingRows/> : isError || !users ? <QueryMessage error retry={() => refetch()}/> : <div className="tv-card tv-table-wrap admin-table"><table className="tv-table"><thead><tr><th>Person</th><th>Role</th><th>Joined</th><th>Change role</th></tr></thead><tbody>{users.map(person => <tr key={person.id} data-testid={`row-user-${person.id}`}><td><div className="person-cell"><span className="person-avatar">{person.name?.[0]?.toUpperCase() || person.email[0].toUpperCase()}</span><span><b>{person.name}</b><small>{person.email}</small></span></div></td><td><span className={`tv-pill ${person.role === 'admin' ? 'role-admin' : 'pill-pending'}`}>{person.role}</span></td><td>{formatDate(person.createdAt)}</td><td><button className="role-change-button" disabled={mutation.isPending || person.id === current.id} onClick={() => changeRole(person)} data-testid={`button-role-${person.id}`}>{person.role === 'admin' ? 'Make member' : 'Make admin'} <ChevronDown size={13}/></button></td></tr>)}</tbody></table></div>}
  </Shell>;
}
function AppRoutes() {
  const [, setLocation] = useLocation();
  return <ClerkProvider publishableKey={clerkPubKey} proxyUrl={clerkProxyUrl} appearance={clerkAppearance} signInUrl={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`}
    localization={{ signIn: { start: { title: 'Welcome back', subtitle: 'Sign in to access your account' } }, signUp: { start: { title: 'Create your account', subtitle: 'A more accountable way to share company files' } } }}
    routerPush={to => setLocation(stripBase(to))} routerReplace={to => setLocation(stripBase(to), { replace: true })}>
    <QueryClientProvider client={queryClient}><CacheInvalidator/>
      <Switch>
        <Route path="/" component={PublicHome}/>
        <Route path="/sign-in/*?"><AuthPages/></Route><Route path="/sign-up/*?"><AuthPages/></Route>
        <Route path="/dashboard"><Protected><Dashboard/></Protected></Route>
        <Route path="/documents"><Protected><DocumentsPage/></Protected></Route>
        <Route path="/shared"><Protected><SharedPage/></Protected></Route>
        <Route path="/access"><Protected><AccessPage/></Protected></Route>
        <Route path="/audit"><Protected><AuditPage/></Protected></Route>
        <Route path="/account"><Protected><AccountPage/></Protected></Route>
        <Route path="/admin/users"><Protected><AdminUsersPage/></Protected></Route>
        <Route><NotFound/></Route>
      </Switch>
    </QueryClientProvider>
  </ClerkProvider>;
}
function App() {
  return <WouterRouter base={basePath}><AppRoutes/></WouterRouter>;
}
export default App;
