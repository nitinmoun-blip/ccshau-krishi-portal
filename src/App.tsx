
import { useEffect, useMemo, useState } from "react";
import {
  BookOpen, FileText, Bell, Leaf, LogIn, LogOut,
  Search, Sun, Moon, ShieldCheck, Upload, Menu
} from "lucide-react";
import { supabase } from "./lib/supabase";

type Course = {
  semester: number;
  title: string;
  credits: number;
  credit_str: string;
  category: string;
  objective: string;
  theory_syllabus: string;
  practical_syllabus: string;
  suggested_readings: string[];
};

type Syllabus = {
  programme: string;
  total_credits: number;
  online_courses_credits: number;
  semesters: { semester: number; courses: Course[]; note?: string }[];
  skill_enhancement_courses: { title: string; credit_str: string }[];
  exit_options: {
    code: string;
    award: string;
    after_semester: number;
    credits: number;
  }[];
};

export default function App() {
  const [meta, setMeta] = useState<Syllabus | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [page, setPage] = useState("Home");
  const [sem, setSem] = useState(1);
  const [query, setQuery] = useState("");
  const [user, setUser] = useState<any>(null);
  const [admin, setAdmin] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [dark, setDark] = useState(false);
  const [message, setMessage] = useState("");
  const [notices, setNotices] = useState<any[]>([]);
  const [papers, setPapers] = useState<any[]>([]);
  const [noticeTitle, setNoticeTitle] = useState("");
  const [noticeBody, setNoticeBody] = useState("");
  const [paperTitle, setPaperTitle] = useState("");
  const [paperSubject, setPaperSubject] = useState("");
  const [year, setYear] = useState("2026");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  // Load syllabus JSON
  useEffect(() => {
    fetch("/data/syllabus.json")
      .then((response) => {
        if (!response.ok) throw new Error("Syllabus file not found");
        return response.json();
      })
      .then((data: Syllabus) => {
        setMeta(data);
        setCourses(data.semesters.flatMap((item) => item.courses));
      })
      .catch(() => setMessage("Unable to load syllabus data."));
  }, []);

  // Check login session
  useEffect(() => {
    if (!supabase) return;

    supabase.auth.getSession().then(({ data, error }) => {
      if (error) {
        setMessage(error.message);
        return;
      }
      setUser(data.session?.user ?? null);
    });

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUser(session?.user ?? null);
      }
    );

    return () => listener.subscription.unsubscribe();
  }, []);

  // Check admin role
  useEffect(() => {
    let active = true;

    async function checkAdmin() {
      if (!supabase || !user) {
        if (active) setAdmin(false);
        return;
      }

      const { data, error } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();

      if (active) {
        setAdmin(!error && data?.role === "admin");
      }
    }

    checkAdmin();
    return () => {
      active = false;
    };
  }, [user]);

  // Load notices and question papers
  useEffect(() => {
    if (!supabase) return;

    async function loadContent() {
      const [noticeResult, paperResult] = await Promise.all([
        supabase.from("notices").select("*").order("created_at", { ascending: false }),
        supabase.from("question_papers").select("*").order("created_at", { ascending: false })
      ]);

      setNotices(noticeResult.data ?? []);
      setPapers(paperResult.data ?? []);
    }

    loadContent();
  }, [user]);

  const shownCourses = useMemo(
    () =>
      courses.filter(
        (course) =>
          course.semester === sem &&
          `${course.title} ${course.objective}`
            .toLowerCase()
            .includes(query.toLowerCase())
      ),
    [courses, sem, query]
  );

  // Login and signup
  
async function handleAuth() {
  if (!supabase) {
    setMessage("Supabase configuration missing.");
    return;
  }

  if (!email || !password) {
    setMessage("Please enter email and password.");
    return;
  }

  setBusy(true);
  setMessage("");

  const result =
    mode === "signup"
      ? await supabase.auth.signUp({ email, password })
      : await supabase.auth.signInWithPassword({ email, password });

  setBusy(false);

  if (result.error) {
    setMessage(result.error.message);
    return;
  }

  if (mode === "login") {
    setUser(result.data.user);
    setPage("Home");
    setMessage("Login successful.");
  } else {
    setMessage("Account created. Check email verification if enabled.");
  }
}
  

  // Logout
  async function handleLogout() {
    if (!supabase) return;
    const { error } = await supabase.auth.signOut();
    setMessage(error?.message ?? "Logged out successfully.");
    setPage("Home");
  }

  // Publish notice
  async function publishNotice() {
    if (!supabase || !user) return;

    if (!noticeTitle.trim() || !noticeBody.trim()) {
      setMessage("Enter notice title and message.");
      return;
    }

    setBusy(true);

    const { error } = await supabase.from("notices").insert({
      title: noticeTitle,
      body: noticeBody,
      created_by: user.id
    });

    setBusy(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    setNoticeTitle("");
    setNoticeBody("");

    const { data } = await supabase
      .from("notices")
      .select("*")
      .order("created_at", { ascending: false });

    setNotices(data ?? []);
    setMessage("Notice published successfully.");
  }

  // Upload question paper
  async function uploadPaper() {
    if (!supabase || !user || !file) return;

    if (!paperTitle.trim() || !paperSubject.trim()) {
      setMessage("Enter paper title and subject.");
      return;
    }

    setBusy(true);
    const path = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;

    const uploadResult = await supabase.storage
      .from("pyq-files")
      .upload(path, file);

    if (uploadResult.error) {
      setBusy(false);
      setMessage(uploadResult.error.message);
      return;
    }

    const { error } = await supabase.from("question_papers").insert({
      title: paperTitle,
      subject: paperSubject,
      semester: sem,
      year: Number(year),
      file_path: path,
      created_by: user.id
    });

    setBusy(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    setPaperTitle("");
    setPaperSubject("");
    setFile(null);

    const { data } = await supabase
      .from("question_papers")
      .select("*")
      .order("created_at", { ascending: false });

    setPapers(data ?? []);
    setMessage("Question paper uploaded successfully.");
  }

  // Download question paper
  async function downloadPaper(path: string) {
    if (!supabase) return;

    const { data, error } = await supabase.storage
      .from("pyq-files")
      .createSignedUrl(path, 60);

    if (error || !data?.signedUrl) {
      setMessage(error?.message ?? "Download link could not be created.");
      return;
    }

    window.open(data.signedUrl, "_blank");
  }

  // Import syllabus courses
  async function importCourses() {
    if (!supabase || !meta) return;

    setBusy(true);

    const rows = meta.semesters.flatMap((semester) =>
      semester.courses.map((course) => ({
        ...course,
        semester: semester.semester
      }))
    );

    const { error } = await supabase
      .from("courses")
      .upsert(rows, { onConflict: "semester,title" });

    setBusy(false);
    setMessage(error?.message ?? `${rows.length} courses imported.`);
  }

  async function downloadSyllabusFile() {
    if (!supabase) return;
    setMessage("Syllabus is available in the Syllabus section.");
  }

  const navigation = [
    "Home",
    "Syllabus",
    "Question Papers",
    "Notices",
    "Skill Courses",
    ...(admin ? ["Admin"] : [])
  ];

  return (
    <div className={dark ? "app dark" : "app"}>
      <aside className="side">
        <div className="logo">
          <Leaf />
          <b>CCSHAU<br /><small>KRISHI PORTAL</small></b>
        </div>

        {navigation.map((item) => (
          <button
            key={item}
            className={page === item ? "active" : ""}
            onClick={() => {
              setPage(item);
              setMessage("");
            }}
          >
            {item}
          </button>
        ))}

        <p className="sidefoot">Student-first learning space 🌱</p>
      </aside>

      <main>
        <header>
          <button className="mobile" onClick={() => setPage("Home")}>
            <Menu />
          </button>

          <span>CCSHAU / {page}</span>

          <div>
            <button className="theme" onClick={() => setDark(!dark)}>
              {dark ? <Sun /> : <Moon />}
            </button>

            {user ? (
              <button onClick={handleLogout}>
                <LogOut size={16} /> Logout
              </button>
            ) : (
              <button onClick={() => setPage("Login")}>
                <LogIn size={16} /> Login
              </button>
            )}
          </div>
        </header>

        <section className="wrap">
          {page === "Home" && (
            <>
              <div className="hero">
                <small>LEARN · GROW · EXCEL</small>
                <h1>
                  Your agriculture journey,
                  <br />
                  <em>all in one place.</em>
                </h1>
                <p>Syllabus · PYQs · Notices, all in one place.</p>
                <button onClick={() => setPage("Syllabus")}>
                  Explore syllabus →
                </button>
              </div>

              <div className="stats">
                <article>
                  <small>PROGRAMME</small>
                  <b>B.Sc. (Hons.) Agriculture</b>
                </article>
                <article>
                  <small>SEMESTERS</small>
                  <b>08</b>
                </article>
                <article>
                  <small>COURSES</small>
                  <b>{courses.length || 71}</b>
                </article>
                <article>
                  <small>CREDITS</small>
                  <b>{meta?.total_credits ?? 167} + online</b>
                </article>
              </div>

              <div className="tiles">
                {[
                  ["Syllabus", "Semester-wise courses and credits", BookOpen],
                  ["Question Papers", "Previous papers by semester and year", FileText],
                  ["Notices", "Academic updates and announcements", Bell]
                ].map(([title, description, Icon]: any) => (
                  <button key={title} onClick={() => setPage(title)}>
                    <Icon />
                    <h3>{title}</h3>
                    <p>{description}</p>
                    Open →
                  </button>
                ))}
              </div>
            </>
          )}

          {page === "Syllabus" && (
            <>
              <h1>Academic syllabus</h1>
              <p>ICAR Sixth Deans' Committee · B.Sc. (Hons.) Agriculture</p>

              <div className="search">
                <Search />
                <input
                  placeholder="Search courses..."
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </div>

              <div className="sem">
                {Array.from({ length: 8 }, (_, index) => (
                  <button
                    key={index}
                    className={sem === index + 1 ? "sel" : ""}
                    onClick={() => setSem(index + 1)}
                  >
                    Sem {index + 1}
                  </button>
                ))}
              </div>

              {sem === 7 && (
                <aside className="banner">
                  Semester VII: Choose any 5 electives · 20 credits.
                </aside>
              )}

              {sem === 8 && (
                <aside className="banner">
                  Student READY · RAWE / experiential learning / internship.
                </aside>
              )}

              <div className="courses">
                {shownCourses.map((course, index) => (
                  <article key={`${course.semester}-${course.title}-${index}`}>
                    <div className="meta">
                      <span>{course.category}</span>
                      <b>{course.credit_str}</b>
                    </div>
                    <h3>{course.title}</h3>
                    <p>{course.objective}</p>

                    <details>
                      <summary>Theory, practical & readings</summary>
                      <h4>Theory</h4>
                      <p className="long">{course.theory_syllabus}</p>
                      <h4>Practical</h4>
                      <p className="long">{course.practical_syllabus}</p>
                      {course.suggested_readings?.map((reading, i) => (
                        <p key={i}>{reading}</p>
                      ))}
                    </details>
                  </article>
                ))}

                {shownCourses.length === 0 && (
                  <article className="empty">No courses found for this search.</article>
                )}
              </div>
            </>
          )}

          {page === "Skill Courses" && (
            <>
              <h1>Skill enhancement courses</h1>
              <p>17 SECs · each 2 (0+2) credits.</p>

              <div className="courses">
                {meta?.skill_enhancement_courses.map((item, index) => (
                  <article key={index}>
                    <div className="meta">
                      SEC {index + 1}
                      <b>{item.credit_str}</b>
                    </div>
                    <h3>{item.title}</h3>
                  </article>
                ))}
              </div>

              <h2>Exit options</h2>
              <div className="courses">
                {meta?.exit_options.map((item) => (
                  <article key={item.code}>
                    <b>{item.code}</b>
                    <h3>{item.award}</h3>
                    <p>
                      After Semester {item.after_semester} · {item.credits} credits
                    </p>
                  </article>
                ))}
              </div>
            </>
          )}

          {page === "Question Papers" && (
            <>
              <h1>Previous question papers</h1>
              {papers.length ? (
                papers.map((paper) => (
                  <article className="row" key={paper.id}>
                    <div>
                      <b>{paper.title}</b>
                      <p>
                        {paper.subject} · Sem {paper.semester} · {paper.year}
                      </p>
                    </div>
                    <button onClick={() => downloadPaper(paper.file_path)}>
                      Download
                    </button>
                  </article>
                ))
              ) : (
                <article className="empty">
                  No papers uploaded yet. They will appear here after admin upload.
                </article>
              )}
            </>
          )}

          {page === "Notices" && (
            <>
              <h1>Important notices</h1>
              {notices.length ? (
                notices.map((notice) => (
                  <article className="row" key={notice.id}>
                    <div>
                      <small>
                        {new Date(notice.created_at).toLocaleDateString()}
                      </small>
                      <h3>{notice.title}</h3>
                      <p>{notice.body}</p>
                    </div>
                  </article>
                ))
              ) : (
                <article className="empty">No notices published yet.</article>
              )}
            </>
          )}

          {page === "Login" && (
            <div className="auth">
              <h1>{mode === "login" ? "Welcome back" : "Create account"}</h1>

              <div className="sem">
                <button onClick={() => setMode("login")}>Login</button>
                <button onClick={() => setMode("signup")}>Sign up</button>
              </div>

              <label>
                Email
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </label>

              <label>
                Password
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </label>

              <button onClick={handleAuth} disabled={busy}>
                {busy ? "Please wait..." : mode === "login" ? "Login" : "Sign up"}
              </button>

              {message && <p>{message}</p>}
            </div>
          )}

          {page === "Admin" && (
            !admin ? (
              <article className="empty">
                <ShieldCheck />
                <h3>Admin access required</h3>
                Sign in with an admin account.
              </article>
            ) : (
              <>
                <h1>Admin panel</h1>

                <article>
                  <h3>Import syllabus</h3>
                  <p>Import courses from the supplied syllabus JSON.</p>
                  <button onClick={importCourses} disabled={busy}>
                    <Upload /> Import courses
                  </button>
                </article>

                <article>
                  <h3>Publish notice</h3>
                  <label>
                    Title
                    <input
                      value={noticeTitle}
                      onChange={(event) => setNoticeTitle(event.target.value)}
                    />
                  </label>
                  <label>
                    Message
                    <textarea
                      value={noticeBody}
                      onChange={(event) => setNoticeBody(event.target.value)}
                    />
                  </label>
                  <button onClick={publishNotice} disabled={busy}>
                    Publish notice
                  </button>
                </article>

                <article>
                  <h3>Upload question paper</h3>
                  <label>
                    Title
                    <input
                      value={paperTitle}
                      onChange={(event) => setPaperTitle(event.target.value)}
                    />
                  </label>
                  <label>
                    Subject
                    <input
                      value={paperSubject}
                      onChange={(event) => setPaperSubject(event.target.value)}
                    />
                  </label>
                  <label>
                    Semester
                    <select value={sem} onChange={(event) => setSem(Number(event.target.value))}>
                      {Array.from({ length: 8 }, (_, i) => (
                        <option key={i} value={i + 1}>Semester {i + 1}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Year
                    <input
                      value={year}
                      onChange={(event) => setYear(event.target.value)}
                    />
                  </label>
                  <label>
                    PDF file
                    <input
                      type="file"
                      accept="application/pdf"
                      onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                    />
                  </label>
                  <button onClick={uploadPaper} disabled={busy || !file}>
                    Upload PDF
                  </button>
                </article>
              </>
            )
          )}

          {message && page !== "Login" && (
            <p className="message">{message}</p>
          )}
        </section>

        <footer>
          Unofficial student-made portal. Not affiliated with CCSHAU or ICAR.
          Verify official information at{" "}
          <a href="https://ccshau.ac.in" target="_blank" rel="noreferrer">
            ccshau.ac.in
          </a>.
        </footer>
      </main>
    </div>
  );
}
