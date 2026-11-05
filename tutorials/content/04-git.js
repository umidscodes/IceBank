/* Tutorial 4: Git and GitHub, applied to a shared Ice Bank test-framework repo. */
(window.ICEBANK = window.ICEBANK || { tutorials: [] }).tutorials.push({
  id: "git",
  number: 4,
  title: "Git and GitHub",
  summary: "Version your test framework, work on branches, review each other's tests through pull requests and keep secrets out of history.",
  intro: `
<p>From week 1 the three of you will build test code together: REST Assured tests, JDBC checks, Selenium page objects. Git keeps every version of every file and lets three
people change the same project without overwriting each other; GitHub hosts the shared copy and adds pull requests for review. The examples assume a shared framework
repository called <code>icebank-tests</code> (use whatever name your team chose) and Git Bash on Windows.</p>
<p>You already cloned one repository: Ice Bank itself. Leave that one alone except for <code>git pull</code> to get updates; your own work lives in the framework repo.</p>`,
  lessons: [
    // ------------------------------------------------------------------------------------------
    {
      id: "concepts",
      title: "Core concepts",
      summary: "Repository, working tree, staging area, commit, branch, remote: the mental model that makes every command obvious.",
      body: `
<p>Most Git confusion comes from not knowing <em>where</em> a change currently lives. There are four places:</p>
<ol>
<li><strong>Working tree</strong>: the files on your disk that IntelliJ edits.</li>
<li><strong>Staging area</strong> (the index): the changes you have selected for the next commit, with <code>git add</code>.</li>
<li><strong>Local repository</strong> (the hidden <code>.git</code> folder): every commit ever made, on your machine. <code>git commit</code> moves staged changes here.</li>
<li><strong>Remote repository</strong> (<code>origin</code>, on GitHub): the shared copy. <code>git push</code> sends your commits there; <code>git fetch</code>/<code>git pull</code> bring others' commits back.</li>
</ol>

<h3>Commits</h3>
<p>A <strong>commit</strong> is a snapshot of the whole project at one moment, plus an author, a date, a message and a pointer to its parent commit. Each has an id (a SHA, e.g.
<code>3f9c2ab</code>). Commits never change; "editing history" really means creating new commits and moving pointers. That is why a password committed once stays in the
history even after you delete the file in a later commit.</p>

<h3>Branches and HEAD</h3>
<p>A <strong>branch</strong> is just a movable label pointing at a commit. <code>main</code> is the shared, always-green branch; you create
<code>feature/etransfer-limit-tests</code> to work without disturbing it. Each new commit on a branch moves its label forward. <code>HEAD</code> means "where I am now"
(normally: the branch you have checked out).</p>

<h3>Remotes and tracking</h3>
<p><code>origin</code> is the default name for the GitHub copy. <code>origin/main</code> is your local memory of where <code>main</code> was on GitHub the last time you fetched. It does
not update by itself: <code>git fetch</code> refreshes it. "Your branch is behind 'origin/main' by 2 commits" means teammates pushed and you have not pulled yet.</p>

<h3>Why testers care</h3>
<ul>
<li>Every test change is reviewable and reversible: if a refactor breaks 30 tests, you can see exactly what changed.</li>
<li>You can check out the version of the tests that matched an old app version.</li>
<li><code>git log</code> and <code>git blame</code> tell you when and why an assertion changed.</li>
</ul>
<h3>What each command changes</h3>
<p>Every Git command you will use moves content between those places, or moves a label in the commit graph. Learn this table and you can predict what any command will do
before you run it (a dash means "not touched"):</p>
<div class="table-wrap"><table>
<thead><tr><th>Command</th><th>Working tree</th><th>Index (staging)</th><th>Commit graph and labels</th><th>GitHub</th></tr></thead>
<tbody>
<tr><td><code>git add F</code></td><td>-</td><td>F copied in, as it is now</td><td>-</td><td>-</td></tr>
<tr><td><code>git commit</code></td><td>-</td><td>- (becomes the new snapshot)</td><td>new commit; the current branch label moves to it; <code>HEAD</code> follows</td><td>-</td></tr>
<tr><td><code>git restore F</code></td><td>F reset to the index version (edits lost)</td><td>-</td><td>-</td><td>-</td></tr>
<tr><td><code>git restore --staged F</code></td><td>-</td><td>F reset to the <code>HEAD</code> version (unstaged)</td><td>-</td><td>-</td></tr>
<tr><td><code>git switch B</code></td><td>files replaced by B's snapshot</td><td>replaced</td><td><code>HEAD</code> now points at B</td><td>-</td></tr>
<tr><td><code>git fetch</code></td><td>-</td><td>-</td><td>new commits downloaded; <code>origin/*</code> labels move</td><td>read only</td></tr>
<tr><td><code>git pull</code></td><td>updated</td><td>updated</td><td>fetch, then your branch moves (fast-forward, merge or rebase)</td><td>read only</td></tr>
<tr><td><code>git push</code></td><td>-</td><td>-</td><td><code>origin/B</code> moves to your commit</td><td>branch B moves</td></tr>
<tr><td><code>git reset --soft X</code></td><td>-</td><td>- (your changes stay staged)</td><td>branch label moves back to X</td><td>-</td></tr>
<tr><td><code>git reset --hard X</code></td><td>replaced (uncommitted work lost)</td><td>replaced</td><td>branch label moves to X</td><td>-</td></tr>
<tr><td><code>git revert X</code></td><td>updated</td><td>updated</td><td>new commit that undoes X; nothing is removed</td><td>-</td></tr>
</tbody></table></div>

<h3>Reading <code>git log --graph</code></h3>
<p>Each <code>*</code> is a commit, newest at the top. Lines show parents: <code>|/</code> is where a branch split off, <code>|\\</code> is a merge (a commit with two parents). The names in
brackets are labels: <code>(HEAD -&gt; feature/etransfer-limit-tests, origin/feature/etransfer-limit-tests)</code> means you are on that branch, and GitHub's copy of it points at the same
commit (nothing to push). If <code>origin/main</code> sits on an older commit than <code>main</code>, you have local commits on <code>main</code> that are not pushed (and you should not
have committed there; lesson 2 shows how to move them).</p>

<h3>What is inside <code>.git</code></h3>
<p>Git stores three kinds of objects: a <strong>blob</strong> is a file's content, a <strong>tree</strong> is a folder listing (names pointing at blobs and other trees) and a
<strong>commit</strong> points at one tree (the snapshot), its parent commit(s), the author and the message. The commit id is a hash of all of that, which is why changing anything,
even only the message, produces a new id. Branches and tags are tiny files holding one commit id.</p>`,
      examples: [
        {
          title: "Where are my changes? (the command you will run most)",
          lang: "bash",
          code: `
git status            # branch, ahead/behind, staged, unstaged and untracked files
git status -sb        # short form: "## feature/x...origin/feature/x [ahead 1]"`,
        },
        {
          title: "Look at history as a graph",
          lang: "bash",
          code: `
git log --oneline --graph --decorate --all -20`,
        },
        {
          title: "The four places, as commands",
          lang: "text",
          code: `
working tree  --git add-->  staging area  --git commit-->  local repo  --git push-->  origin (GitHub)
working tree  <--git restore--  staging area
local repo    <--git fetch / git pull--  origin`,
        },
        {
          title: "The three local places and the diff that compares them",
          lang: "text",
          code: `
 working tree             index (staging area)          HEAD (last commit on your branch)
 files IntelliJ edits     what the next commit holds    the snapshot you last committed
 --------------------     -------------------------     ---------------------------------
        |  -- git add F ------------> |                                |
        |                             |  -- git commit ------------>   |  (branch label moves)
        | <-- git restore F --------  |                                |
        |                             | <-- git restore --staged F --  |

 git diff            working tree vs index   (what you have NOT staged yet)
 git diff --staged   index vs HEAD           (what the next commit will contain)
 git diff HEAD       working tree vs HEAD    (everything since the last commit)`,
        },
        {
          title: "A commit graph with one feature branch",
          lang: "text",
          code: `
 After: two commits on main (A, B), branch created at B, two commits on the branch (C, D),
 and a teammate's PR merged into main (E):

               C---D      feature/etransfer-limit-tests   <- HEAD
              /
     A---B---E            main, origin/main

 git log --oneline --graph --all draws the same thing, newest first:

 * 4dd1940 (HEAD -> feature/etransfer-limit-tests) Add daily limit boundary tests
 * 2b07c1e Add per-transfer limit boundary tests
 | * 5161ff7 (main, origin/main) Tag e-Transfer limit tests
 |/
 * 8e72cd8 Create Maven test framework skeleton`,
          note: "Your ids will differ. <code>git log main..HEAD</code> lists C and D (on your branch, not on main); <code>git log HEAD..origin/main</code> lists E (what you would get by rebasing).",
        },
        {
          title: "Look inside a commit",
          lang: "bash",
          code: `
git cat-file -t HEAD              # commit
git cat-file -p HEAD              # the raw commit object
# tree 6bed9606ea8026b22678bf7e17c3179214b56506
# parent 5161ff7bfbb63ccddc206f1edad35548616e98da
# author Student B <b@example.com> 1793893548 +0000
# committer Student B <b@example.com> 1793893595 +0000
#
# Replace single limit test with boundary table

git cat-file -p 'HEAD^{tree}'     # the snapshot's top folder (quotes needed in PowerShell)
# 100644 blob 98eeccd...   .gitignore
# 100644 blob a1e54a0...   pom.xml
# 040000 tree 1ffd4c9...   src`,
        },
      ],
      exercises: [
        "Run <code>git log --oneline --graph --decorate -15</code> inside your local Ice Bank clone. Identify <code>HEAD</code>, <code>main</code> and <code>origin/main</code> in the output and explain in one sentence each what they point to.",
        "Change a file in your framework repo without staging it, stage a second file, and create a third new file. Run <code>git status</code> and say which of the four places each change is in.",
        "Draw (on paper or in your notes) the commit graph after: two commits on <code>main</code>, a branch with two commits, and one more commit on <code>main</code>. Mark where each branch label and <code>HEAD</code> point.",
        "Run <code>git cat-file -p HEAD</code> and <code>git cat-file -p 'HEAD^{tree}'</code> in your framework repo. Write down what a commit object contains, and which lines (and which id) would change if you amended only the commit message.",
      ],
      quiz: [
        {
          q: "You edit <code>LoginTest.java</code>, run <code>git add LoginTest.java</code>, edit it again, then run <code>git commit -m \"...\"</code>. What is in the commit?",
          options: [
            "Both edits, because the file is tracked",
            "Only the first edit; the second one is still an unstaged change in the working tree",
            "Only the second edit, because it is newer",
            "Nothing: Git refuses to commit a file that changed after <code>git add</code>",
          ],
          answer: 1,
          explain: "<code>git add</code> copies the file into the index <em>as it is at that moment</em>. The commit is made from the index, so the later edit stays in the working tree and shows up in <code>git diff</code>.",
        },
        {
          q: "What does <code>git fetch</code> change on your machine?",
          options: [
            "Your working tree files, to match GitHub",
            "Your current branch, which moves to <code>origin</code>'s commit",
            "Only the remote-tracking labels such as <code>origin/main</code> (and it downloads the new commits); your files and branches are untouched",
            "Nothing at all; it only prints what is new",
          ],
          answer: 2,
          explain: "Fetch is always safe: it downloads commits and moves <code>origin/*</code>. Integrating them into your branch is a separate step (<code>git pull</code>, <code>git rebase origin/main</code> or <code>git merge origin/main</code>).",
        },
        {
          q: "After <code>git fetch</code>, <code>git status</code> says \"Your branch is behind 'origin/main' by 2 commits\". What does it mean?",
          options: [
            "Teammates pushed 2 commits to main that your local main does not have yet",
            "You have 2 commits that you have not pushed",
            "2 of your commits were deleted on GitHub",
            "You must use <code>git push --force</code> to catch up",
          ],
          answer: 0,
          explain: "Behind means GitHub's main has commits you lack. <code>git pull</code> fast-forwards your main. \"Ahead\" would mean you have unpushed commits.",
        },
        {
          q: "Someone committed the QA sandbox key in a properties file and deleted the file in the next commit. Is the key gone from the repository?",
          options: [
            "Yes, the latest commit does not contain it",
            "Yes, if the second commit was pushed before anyone pulled",
            "No: the earlier commit is an unchangeable snapshot that still contains it, on every clone and on GitHub",
            "No, but <code>git restore</code> removes it from history",
          ],
          answer: 2,
          explain: "Commits never change. The old snapshot keeps the key, and anyone can read it with <code>git show</code> or <code>git log -p</code>. Treat it as leaked (lesson 7).",
        },
        {
          q: "Which command shows exactly what your next commit will contain?",
          options: ["<code>git diff</code>", "<code>git diff --staged</code>", "<code>git log -p -1</code>", "<code>git status -sb</code>"],
          answer: 1,
          explain: "<code>git diff --staged</code> compares the index with <code>HEAD</code>. Plain <code>git diff</code> shows what you have <em>not</em> staged; <code>git log -p -1</code> shows the previous commit.",
        },
      ],
    },
    // ------------------------------------------------------------------------------------------
    {
      id: "clone-add-commit",
      title: "Clone, add, commit",
      summary: "Get a repository, make a focused change and record it properly.",
      body: `
<h3>One-time setup</h3>
<p>Tell Git who you are (this goes into every commit) and how to handle Windows line endings:</p>
<ul>
<li><code>git config --global user.name "Your Name"</code> and <code>git config --global user.email "you@example.com"</code> (use the email of your GitHub account).</li>
<li><code>git config --global core.autocrlf true</code> on Windows: files are stored with LF in the repository and checked out with CRLF, so the three of you do not produce
"every line changed" diffs.</li>
<li><code>git config --global init.defaultBranch main</code> and <code>git config --global pull.rebase true</code> (lesson 4 explains why).</li>
</ul>

<h3>Clone</h3>
<p><code>git clone &lt;url&gt;</code> copies a remote repository, with its whole history, into a new folder and sets <code>origin</code>. Use the HTTPS URL from GitHub's green <em>Code</em>
button; Git Credential Manager (installed with Git for Windows) opens a browser to sign you in the first time.</p>

<h3>The edit → add → commit loop</h3>
<ol>
<li>Edit in IntelliJ.</li>
<li><code>git status</code> and <code>git diff</code>: read what you actually changed. This is a mini self-review that catches debug prints, hard-coded tokens and accidental edits.</li>
<li><code>git add path/to/File.java</code> stages specific files. <code>git add -p</code> lets you stage piece by piece. Avoid <code>git add .</code> until you have a good
<code>.gitignore</code> (lesson 7), or you will commit <code>target/</code> and IDE files.</li>
<li><code>git diff --staged</code> shows exactly what will be committed.</li>
<li><code>git commit -m "Add e-Transfer daily limit boundary tests"</code>.</li>
</ol>
<p>Make commits small and about one thing: "add login OTP helper" and "fix flaky wait on transfer page" are two commits, not one. Small commits are easier to review, revert
and understand later.</p>

<h3>Undoing things (before you push)</h3>
<ul>
<li><code>git restore File.java</code>: throw away unstaged edits to a file (careful: gone for good).</li>
<li><code>git restore --staged File.java</code>: unstage, keep the edit.</li>
<li><code>git commit --amend</code>: fix the last commit's message or add a forgotten file. Only before pushing.</li>
</ul>
<h3>Windows PowerShell, Git Bash, macOS and Linux</h3>
<p>Git commands are identical everywhere. What differs is the shell around them. If a command from this site fails only on your machine, check this table first:</p>
<div class="table-wrap"><table>
<thead><tr><th>Task</th><th>Git Bash, macOS, Linux</th><th>Windows PowerShell</th></tr></thead>
<tbody>
<tr><td>Line endings (one-time)</td><td><code>git config --global core.autocrlf input</code> (macOS, Linux)</td><td><code>git config --global core.autocrlf true</code></td></tr>
<tr><td>Run a second command if the first succeeded</td><td><code>git pull &amp;&amp; mvn -q test</code></td><td>PowerShell 7: same. Windows PowerShell 5.1: <code>git pull; if ($?) { mvn -q test }</code></td></tr>
<tr><td>Refs with braces (reflog, stash)</td><td><code>git reset --hard HEAD@{1}</code></td><td><code>git reset --hard 'HEAD@{1}'</code> (quote it: <code>@{</code> starts a PowerShell hashtable)</td></tr>
<tr><td>Maven properties with a dot</td><td><code>mvn test -Dmaven.test.failure.ignore=true</code></td><td><code>mvn test "-Dmaven.test.failure.ignore=true"</code> (Windows PowerShell can split it at the dot; quoting is safe in every version)</td></tr>
<tr><td>Create an empty file</td><td><code>touch notes.txt</code></td><td><code>New-Item notes.txt</code></td></tr>
<tr><td>Delete a folder</td><td><code>rm -rf target</code></td><td><code>Remove-Item -Recurse -Force target</code></td></tr>
<tr><td>First lines of output</td><td><code>git log --oneline | head -5</code></td><td><code>git log --oneline | Select-Object -First 5</code></td></tr>
<tr><td>Search output</td><td><code>git branch -a | grep etransfer</code></td><td><code>git branch -a | Select-String etransfer</code></td></tr>
<tr><td>Environment variable for one session</td><td><code>export ICEBANK_ENV=qa</code></td><td><code>$env:ICEBANK_ENV = "qa"</code></td></tr>
<tr><td>Append a line to a text file</td><td><code>echo "target/" &gt;&gt; .gitignore</code></td><td><code>Add-Content -Encoding ascii .gitignore "target/"</code> (in Windows PowerShell 5.1, <code>&gt;&gt;</code> writes UTF-16, and Git cannot read such a <code>.gitignore</code>)</td></tr>
</tbody></table></div>
<p>Signing in to GitHub: Git for Windows includes Git Credential Manager, which opens a browser. On macOS and Linux, install Git Credential Manager too, or install the GitHub CLI and run
<code>gh auth login</code> then <code>gh auth setup-git</code>. GitHub does not accept your account password for <code>git push</code>.</p>

<h3>Walkthrough: one commit, and what each step changed</h3>
<ol>
<li><strong>Create</strong> <code>HealthTest.java</code> in IntelliJ. <code>git status -s</code> shows <code>?? src/.../HealthTest.java</code>: untracked, it exists only in the working tree.</li>
<li><strong>Stage</strong> it: <code>git add src/test/java/com/icebank/api/HealthTest.java</code>. Now <code>A  src/.../HealthTest.java</code>: the left column is the index (A = added).</li>
<li><strong>Edit again</strong> (add an assertion). Now <code>AM</code>: added in the index, modified again in the working tree. <code>git diff</code> shows the new assertion only.</li>
<li><strong>Stage again</strong> and check: <code>git add</code> the file, then <code>git diff --staged</code> shows the whole file as it will be committed.</li>
<li><strong>Commit</strong>: <code>git commit -m "Add health check test for GET /test/health"</code>. <code>git status</code> is clean, <code>main</code> (or your branch) points at the new commit,
and <code>git status -sb</code> says <code>[ahead 1]</code>: committed locally, not yet on GitHub.</li>
</ol>

<h3>Recovering from mistakes</h3>
<p>Almost everything in Git can be undone. Pick the command by two questions: <em>where is the mistake</em> (working tree, index, a commit) and <em>has it been pushed</em>?</p>
<div class="table-wrap"><table>
<thead><tr><th>Situation</th><th>Pushed?</th><th>Command</th><th>What it changes</th></tr></thead>
<tbody>
<tr><td>Unwanted edits in a file, not staged</td><td>-</td><td><code>git restore F</code></td><td>Working tree file back to the staged/committed version. The edits are gone for good.</td></tr>
<tr><td>Staged a file by mistake</td><td>-</td><td><code>git restore --staged F</code></td><td>Index only; your edit stays in the working tree.</td></tr>
<tr><td>Want a file exactly as it is on main</td><td>-</td><td><code>git restore --source=origin/main F</code></td><td>Working tree file replaced by main's version; commit it if you want to keep that.</td></tr>
<tr><td>Wrong message or a forgotten file in the last commit</td><td>No</td><td><code>git commit --amend</code></td><td>Replaces the last commit with a new one (new id).</td></tr>
<tr><td>Several messy local commits ("wip", "wip 2")</td><td>No</td><td><code>git reset --soft HEAD~2</code>, then one <code>git commit</code></td><td>Branch label moves back two commits; all their changes stay staged, ready for one clean commit.</td></tr>
<tr><td>Committed on <code>main</code> instead of a branch</td><td>No</td><td><code>git branch feature/x</code>, <code>git reset --hard origin/main</code>, <code>git switch feature/x</code></td><td>The new label keeps your commit; main goes back to GitHub's main.</td></tr>
<tr><td>A bad commit is already pushed or merged</td><td>Yes</td><td><code>git revert &lt;id&gt;</code>, then push</td><td>New commit that undoes it. Nobody's history is rewritten.</td></tr>
<tr><td>A bad merge commit on main</td><td>Yes</td><td><code>git revert -m 1 &lt;merge-id&gt;</code></td><td>Undoes everything that merge brought in (<code>-m 1</code>: keep the main side).</td></tr>
<tr><td>"I lost commits" (after <code>reset --hard</code>, a bad rebase, a deleted branch)</td><td>Either</td><td><code>git reflog</code>, then <code>git reset --hard 'HEAD@{n}'</code> or <code>git branch rescue &lt;id&gt;</code></td><td>The reflog lists every position <code>HEAD</code> had; jump back to the one before the mistake.</td></tr>
</tbody></table></div>
<div class="callout warn"><p><strong>Two things cannot be recovered.</strong> Uncommitted edits thrown away with <code>git restore</code> or <code>git reset --hard</code> were never in a commit, so the
reflog cannot bring them back; commit or <code>git stash</code> before you experiment. And the reflog is local to your clone: it cannot recover commits someone else deleted on
GitHub with <code>--force</code>.</p></div>`,
      examples: [
        {
          title: "Start the shared framework repo (one person does this once)",
          lang: "bash",
          code: `
mkdir icebank-tests && cd icebank-tests
git init
# create pom.xml, src/test/java/..., README.md, .gitignore (lesson 7) first
git add pom.xml README.md .gitignore src
git commit -m "Create Maven test framework skeleton"
git remote add origin https://github.com/<team>/icebank-tests.git
git push -u origin main`,
        },
        {
          title: "Everyone else: clone and check",
          lang: "bash",
          code: `
cd ~/projects
git clone https://github.com/<team>/icebank-tests.git
cd icebank-tests
git log --oneline
mvn -q test -Denv=local     # the framework should build and run straight after cloning`,
        },
        {
          title: "A focused commit",
          lang: "bash",
          code: `
git status
git diff
git add src/test/java/com/icebank/api/HealthTest.java
git diff --staged
git commit -m "Add health check test for GET /test/health"`,
        },
        {
          title: "Recovery drill 1: squash two wip commits with reset --soft",
          lang: "bash",
          code: `
git log --oneline -3
# a3ac8b7 wip 2
# 6164838 wip
# 622f5c0 Add README

git reset --soft HEAD~2        # branch moves back to 622f5c0; working tree untouched
git status -s
# M  README.md                 # both wip commits' changes, staged
git commit -m "Add README with how-to-run section"
git log --oneline -2
# ddcbebd Add README with how-to-run section
# 622f5c0 Add README`,
          note: "Only on commits you have not pushed. Once pushed, rewriting them forces everyone else to repair their clone.",
        },
        {
          title: "Recovery drill 2: get a commit back after reset --hard",
          lang: "bash",
          code: `
git reset --hard HEAD~1        # oops: the last commit is no longer on the branch
git reflog -3
# 622f5c0 HEAD@{0}: reset: moving to HEAD~1
# ddcbebd HEAD@{1}: commit: Add README with how-to-run section
# 622f5c0 HEAD@{2}: reset: moving to HEAD~2

git reset --hard 'HEAD@{1}'    # back to where HEAD was one move ago
git log --oneline -1
# ddcbebd Add README with how-to-run section

# Alternative that does not move your branch: keep the lost commit on a new branch
git branch rescue/readme ddcbebd`,
        },
        {
          title: "Undo after pushing, and moving a commit off main",
          lang: "bash",
          code: `
# A pushed commit broke the suite: revert it (a new commit), then push
git revert --no-edit fcc894d
# [main c050f7f] Revert "Lower timeout to 1 second"
git push

# You committed on main by mistake (not pushed yet)
git status -sb                 # ## main...origin/main [ahead 1]
git branch docs/readme         # a label on your commit, so it is not lost
git reset --hard origin/main   # main back to GitHub's main
git switch docs/readme         # continue there and open a PR`,
        },
      ],
      exercises: [
        "Configure <code>user.name</code>, <code>user.email</code>, <code>core.autocrlf</code> and <code>pull.rebase</code>, then show them with <code>git config --global --list</code>.",
        "Clone your team's framework repo (or create it if you are the first). Add a REST Assured test that calls <code>GET /api/v1/test/health</code> on Ice Bank local and asserts <code>status</code> is <code>UP</code>. Commit it as one focused commit.",
        "Make a change with two unrelated edits in the same file. Use <code>git add -p</code> to commit them as two separate commits. Show the result with <code>git log -p -2</code>.",
        "Commit something with a typo in the message, then fix it with <code>git commit --amend</code>. Explain why you must not do this after pushing.",
        "In a scratch repository (not your team's), run both recovery drills: make two \"wip\" commits and squash them with <code>git reset --soft</code>, then <code>git reset --hard HEAD~1</code> and bring the commit back with <code>git reflog</code>. Paste the reflog lines you used and say what each command changed in the working tree, the index and the branch label.",
        "Commit a small change directly on <code>main</code> in your clone (do not push). Move it to a new branch with the three commands from the table, push that branch, and show with <code>git status -sb</code> that <code>main</code> is level with <code>origin/main</code> again.",
      ],
      quiz: [
        {
          q: "You staged <code>config/qa.properties</code> by mistake. You want to keep your edits but not commit them. Which command?",
          options: ["<code>git restore config/qa.properties</code>", "<code>git restore --staged config/qa.properties</code>", "<code>git reset --hard</code>", "<code>git rm config/qa.properties</code>"],
          answer: 1,
          explain: "<code>--staged</code> only touches the index. Plain <code>git restore</code> would throw the edits away, <code>reset --hard</code> throws away everything uncommitted, and <code>git rm</code> deletes the file.",
        },
        {
          q: "A commit you pushed to the shared <code>main</code> an hour ago breaks 20 tests. Teammates have already pulled. What is the right undo?",
          options: [
            "<code>git reset --hard HEAD~1</code> and <code>git push --force</code>",
            "<code>git commit --amend</code> and push",
            "<code>git revert &lt;id&gt;</code> and push (through a PR if main is protected)",
            "Delete the file and make a new commit called \"fix\"",
          ],
          answer: 2,
          explain: "Revert adds a new commit that undoes the bad one, so nobody's history changes. Resetting and force-pushing a shared branch removes a commit that others already have and breaks their next pull.",
        },
        {
          q: "After <code>git reset --soft HEAD~2</code>, where are the changes from those two commits?",
          options: [
            "Gone; soft only means \"ask before deleting\"",
            "Staged in the index, and still in the working tree; only the branch label moved back",
            "In the working tree but unstaged",
            "In the stash",
          ],
          answer: 1,
          explain: "<code>--soft</code> moves only the branch label. <code>--mixed</code> (the default) would also unstage them; <code>--hard</code> would discard them.",
        },
        {
          q: "You ran <code>git reset --hard HEAD~1</code> on an unpushed commit by mistake. How do you get it back?",
          options: [
            "You cannot; <code>--hard</code> is permanent",
            "<code>git pull</code>",
            "<code>git reflog</code> to find it, then <code>git reset --hard 'HEAD@{1}'</code> (or create a branch at its id)",
            "<code>git restore --staged .</code>",
          ],
          answer: 2,
          explain: "The commit still exists; only the label moved. The reflog records every position of <code>HEAD</code>, so you can jump back. (Uncommitted edits would have been lost for good.)",
        },
        {
          q: "In Windows PowerShell, <code>git reset --hard HEAD@{1}</code> fails with a strange error, but it works in Git Bash. Why?",
          options: [
            "PowerShell reads <code>@{</code> as the start of a hashtable; quote the ref: <code>'HEAD@{1}'</code>",
            "The reflog is not available on Windows",
            "PowerShell needs <code>git.exe</code> instead of <code>git</code>",
            "You must run PowerShell as administrator",
          ],
          answer: 0,
          explain: "The shell changes the argument before Git sees it. Single quotes pass it through untouched; the same applies to <code>stash@{0}</code> and <code>HEAD^{tree}</code>.",
        },
      ],
    },
    // ------------------------------------------------------------------------------------------
    {
      id: "branches",
      title: "Branches",
      summary: "Work on your own line of changes without breaking main for anyone else.",
      body: `
<p>A branch lets you change the framework freely while <code>main</code> stays green for the other two. The team rule is simple: <strong>nobody commits directly to
<code>main</code></strong>; every change starts on a branch and arrives through a pull request.</p>

<h3>Creating and switching</h3>
<ul>
<li><code>git switch main</code> then <code>git pull</code>: always branch from an up-to-date <code>main</code>.</li>
<li><code>git switch -c feature/transfer-negative-tests</code>: create the branch and switch to it.</li>
<li><code>git branch</code> lists local branches (the current one has a <code>*</code>); <code>git branch -a</code> includes remote ones.</li>
<li><code>git switch other-branch</code> changes the files on disk to that branch. Commit or stash your work first; Git refuses if uncommitted changes would be overwritten.</li>
</ul>

<h3>Naming</h3>
<p>Agree on a pattern so branches sort and read well: <code>feature/…</code> for new tests or framework features, <code>fix/…</code> for repairing tests, <code>chore/…</code> for
build and config. Name after the work, not the person: <code>feature/etransfer-limits</code>, <code>fix/flaky-otp-wait</code>, <code>chore/allure-2-29</code>.</p>

<h3>Keeping a branch short-lived</h3>
<p>The longer a branch lives, the more <code>main</code> moves under it and the harder the merge. Aim for branches that last one or two days and contain one reviewable
idea (for example "boundary tests for e-Transfer limits", not "week 2"). Update it from <code>main</code> regularly (next lesson).</p>

<h3>Stash: put work aside for a moment</h3>
<p><code>git stash</code> saves uncommitted changes and cleans the working tree, so you can switch branches to review a teammate's work; <code>git stash pop</code> brings them back.</p>

<h3>Deleting</h3>
<p>After a pull request is merged, delete the branch: <code>git branch -d feature/x</code> locally (GitHub offers a button for the remote one). <code>-d</code> refuses if the branch
is not merged, which protects you; <code>-D</code> forces.</p>
<h3>A naming convention you can adopt as is</h3>
<div class="table-wrap"><table>
<thead><tr><th>Prefix</th><th>Use for</th><th>Ice Bank examples</th></tr></thead>
<tbody>
<tr><td><code>feature/</code></td><td>New tests or new framework capability</td><td><code>feature/etransfer-daily-limit</code>, <code>feature/12-bill-payment-scheduling</code> (12 = issue number)</td></tr>
<tr><td><code>fix/</code></td><td>Repair a failing, flaky or wrong test or helper</td><td><code>fix/otp-wait-timeout</code>, <code>fix/transfer-balance-oracle</code></td></tr>
<tr><td><code>chore/</code></td><td>Build, dependencies, CI, config</td><td><code>chore/allure-2-29</code>, <code>chore/maven-surefire-tags</code></td></tr>
<tr><td><code>refactor/</code></td><td>Restructure without changing what is tested</td><td><code>refactor/auth-client-token-refresh</code></td></tr>
<tr><td><code>docs/</code></td><td>README, how-to, conventions</td><td><code>docs/how-we-work</code></td></tr>
</tbody></table></div>
<p>Rules: lower case, words joined with hyphens, no spaces or accents, no personal names, short enough to read in <code>git branch</code> (under about 40 characters). Optional: start
with the issue number so GitHub and your board link up.</p>

<h3>What switching really does</h3>
<p><code>git switch B</code> rewrites the working tree and index to B's snapshot and points <code>HEAD</code> at B. Uncommitted changes come along <em>if</em> they do not clash with
B's version of those files. If they do, Git stops before touching anything:</p>
<p><code>error: Your local changes to the following files would be overwritten by checkout: README.md. Please commit your changes or stash them before you switch branches.</code></p>
<p>That message is protection, not a problem: commit, stash, or (if the edits are junk) restore. Two handy forms: <code>git switch -</code> goes back to the previous branch, and
<code>git switch -c feature/x</code> with uncommitted edits takes those edits onto the new branch, which is how you fix "I started working on main by mistake" before committing.</p>

<h3>Seeing where every branch is</h3>
<p><code>git branch -vv</code> lists local branches with their last commit and their tracking state, for example
<code>main 8e72cd8 [origin/main: behind 1]</code>: your local main is one commit behind the last fetch of GitHub's main. Branch from <code>origin/main</code> (or pull first), never from a stale
local main.</p>`,
      examples: [
        {
          title: "Start a new piece of work",
          lang: "bash",
          code: `
git switch main
git pull
git switch -c feature/etransfer-limit-tests
# ...write tests, commit...
git log --oneline main..HEAD     # the commits on your branch that main does not have`,
        },
        {
          title: "Interrupted: review a teammate's branch, then come back",
          lang: "bash",
          code: `
git stash push -m "half-done limit tests"
git fetch
git switch feature/payee-crud-tests      # teammate's branch (tracks origin automatically)
mvn -q test -Dtest=PayeeCrudTest -Denv=local
git switch feature/etransfer-limit-tests
git stash pop`,
        },
        {
          title: "Clean up merged branches",
          lang: "bash",
          code: `
git switch main
git pull
git branch --merged          # branches already contained in main
git branch -d feature/etransfer-limit-tests
git fetch --prune            # forget remote branches deleted on GitHub`,
        },
        {
          title: "Started editing on main by mistake (nothing committed yet)",
          lang: "bash",
          code: `
git status -sb
# ## main...origin/main
#  M src/test/java/com/icebank/api/ETransferLimitTest.java
git switch -c feature/etransfer-daily-limit    # the edit comes along, still uncommitted
git status -sb
# ## feature/etransfer-daily-limit
#  M src/test/java/com/icebank/api/ETransferLimitTest.java
git add -p && git commit -m "Add daily limit boundary tests"`,
        },
        {
          title: "Read the state of every branch",
          lang: "bash",
          code: `
git fetch
git branch -vv
# * feature/etransfer-per-transfer-boundaries 905d63b [origin/feature/etransfer-per-transfer-boundaries: ahead 1, behind 1] Replace ...
#   main                                      8e72cd8 [origin/main: behind 1] Create Maven test framework skeleton

# Branch new work from GitHub's main even if your local main is stale:
git switch -c fix/otp-wait-timeout origin/main`,
          note: "<code>ahead 1, behind 1</code> means the branch has diverged: you have a commit GitHub does not, and GitHub has one you do not. Lesson 4 shows how to bring them together.",
        },
      ],
      exercises: [
        "Agree with your teammates on a branch naming convention and write it into the framework README.",
        "Create <code>feature/accounts-api-tests</code> from an up-to-date <code>main</code>, add a test for <code>GET /api/v1/accounts</code> as Emma (four accounts, ids 1 to 4), and commit. Show <code>git log --oneline main..HEAD</code>.",
        "While you have uncommitted changes, stash them, check out a teammate's branch, run their tests against Ice Bank local, come back and pop the stash.",
        "After your branch is merged (lesson 5), delete it locally and remotely and run <code>git fetch --prune</code>.",
        "Write a branch name, following your team's convention, for each of these tasks: repair a flaky wait for the OTP email; add scheduled bill payment tests (issue 14); upgrade Allure; restructure <code>AuthClient</code> without changing any test; add a \"How to run on QA\" README section. Explain the prefix you chose for each.",
      ],
      quiz: [
        {
          q: "Which branch name best fits the convention in this lesson?",
          options: ["<code>Emma-work</code>", "<code>feature/etransfer-daily-limit</code>", "<code>week2/stuff from lucas</code>", "<code>fix</code>"],
          answer: 1,
          explain: "Prefix plus a short, hyphenated description of the work. Personal names, spaces and vague names make branches hard to read and sort.",
        },
        {
          q: "You have uncommitted edits on <code>main</code> and run <code>git switch -c feature/payee-tests</code>. What happens to the edits?",
          options: [
            "They are discarded, because the new branch starts clean",
            "They stay on main and the new branch has none of them",
            "They come along to the new branch, still uncommitted",
            "Git refuses to create a branch while files are modified",
          ],
          answer: 2,
          explain: "A new branch starts at the same commit, so nothing clashes and the working tree is left alone. Commit them on the new branch and main stays clean.",
        },
        {
          q: "<code>git branch -d feature/old-tests</code> answers \"the branch 'feature/old-tests' is not fully merged\". What does that tell you?",
          options: [
            "The branch has commits that are not in your current branch; deleting it with <code>-D</code> would drop them (except via the reflog)",
            "The branch was deleted on GitHub",
            "Somebody else has the branch checked out",
            "You need to run <code>git fetch --prune</code> first",
          ],
          answer: 0,
          explain: "<code>-d</code> only deletes branches whose commits are already contained elsewhere. Check with <code>git log main..feature/old-tests</code> before forcing.",
        },
        {
          q: "Why keep branches short-lived (one or two days)?",
          options: [
            "GitHub deletes branches older than a week",
            "main moves less underneath them, so conflicts and reviews stay small",
            "Long branches use more disk space",
            "Git cannot rebase branches with more than 10 commits",
          ],
          answer: 1,
          explain: "The longer a branch lives, the more main changes, and the more of those changes touch the same lines you changed.",
        },
      ],
    },
    // ------------------------------------------------------------------------------------------
    {
      id: "push-pull",
      title: "Push and pull",
      summary: "Share your commits and bring in everyone else's, without surprises.",
      body: `
<h3>Push</h3>
<p><code>git push</code> sends your branch's new commits to GitHub. The first time for a new branch use <code>git push -u origin feature/x</code>: <code>-u</code> remembers that
your local branch tracks <code>origin/feature/x</code>, so later a plain <code>git push</code> and <code>git pull</code> know where to go. Push at least once a day even if the
work is unfinished: your laptop is not a backup, and teammates can see progress.</p>
<p>If push is <em>rejected</em> ("Updates were rejected because the remote contains work that you do not have locally"), someone pushed to the same branch. Pull first, then push.
Never fix it with <code>git push --force</code> on a shared branch; it deletes their commits from GitHub. On your own branch, after a rebase, use
<code>git push --force-with-lease</code>, which refuses if someone else pushed in the meantime.</p>

<h3>Fetch vs pull</h3>
<ul>
<li><code>git fetch</code> downloads new commits and updates <code>origin/*</code> labels. It never touches your files. Safe any time.</li>
<li><code>git pull</code> = <code>git fetch</code> + integrate <code>origin/&lt;your-branch&gt;</code> into your branch, either by <strong>merge</strong> (creates a merge commit) or by
<strong>rebase</strong> (replays your local commits on top). With <code>pull.rebase true</code> (lesson 2) you get a straight history without "Merge branch 'main' of github.com…" noise.</li>
</ul>

<h3>Keeping your feature branch up to date with main</h3>
<p>While you work, teammates merge into <code>main</code>. Bring those changes into your branch before you open (or update) a pull request, so you test against the latest framework:</p>
<ul>
<li><strong>Rebase</strong> (cleaner history): <code>git fetch</code> then <code>git rebase origin/main</code>, then <code>git push --force-with-lease</code>.</li>
<li><strong>Merge</strong> (simpler, never rewrites): <code>git fetch</code> then <code>git merge origin/main</code>, then <code>git push</code>.</li>
</ul>
<p>Pick one as a team. Rebase is fine on a branch only you push to; merge is safer on a branch two people share.</p>

<h3>Ice Bank itself</h3>
<p>When the instructor updates Ice Bank, run <code>git pull</code> in your Ice Bank clone, then <code>npm install</code> (dependencies may have changed) and restart
<code>npm run dev</code>. Do not edit the Ice Bank repo; local changes there make every <code>git pull</code> a conflict.</p>
<h3>Before and after: fetch, pull, push</h3>
<p>The diagrams in the examples below show the commit graph at each step. Two words to know: a <strong>fast-forward</strong> is when your branch simply moves forward to a newer
commit (no new commit needed, nothing to merge), and a <strong>diverged</strong> branch has commits on both sides, which <code>git status</code> shows as
<code>[ahead 1, behind 1]</code>. Diverged branches need a rebase or a merge before you can push.</p>

<h3>Rejected push: the exact message</h3>
<p>When a teammate pushed first, Git answers:</p>
<p><code>! [rejected] main -&gt; main (fetch first)</code> and <code>hint: Updates were rejected because the remote contains work that you do not have locally.</code></p>
<p>Fix: <code>git pull</code> (with <code>pull.rebase true</code> your commit is replayed on top of theirs), run the tests, <code>git push</code>.</p>

<h3>Force-with-lease, and the one way to defeat it</h3>
<p><code>--force-with-lease</code> overwrites the remote branch only if it is still where your last fetch saw it. If someone pushed to your branch in the meantime, Git refuses with
<code>! [rejected] ... (stale info)</code>. The catch: running <code>git fetch</code> first updates what Git "last saw", so a later <code>--force-with-lease</code> would happily overwrite
the teammate's commit. After a fetch, look before you force: <code>git log HEAD..origin/feature/x</code> must be empty (or contain only commits you rebased). Git 2.30 and newer
also offer <code>--force-if-includes</code>, which adds that check for you.</p>

<h3>Undoing something already pushed</h3>
<p>Once a commit is on GitHub and others may have pulled it, undo it with <code>git revert</code> (a new commit), not with <code>reset</code> and a force-push. On your own branch
that nobody else uses, rewriting is fine; on <code>main</code>, never.</p>`,
      examples: [
        {
          title: "First push of a new branch",
          lang: "bash",
          code: `
git push -u origin feature/etransfer-limit-tests
# later pushes on the same branch:
git push`,
        },
        {
          title: "Bring main's latest commits into your branch (rebase style)",
          lang: "bash",
          code: `
git fetch
git rebase origin/main
mvn -q test -Denv=local           # still green on top of the new main?
git push --force-with-lease`,
        },
        {
          title: "Update your Ice Bank clone",
          lang: "bash",
          code: `
cd ~/projects/IceBank
git status                 # should be clean; if not, you edited the app by mistake
git pull
npm install
npm run dev`,
        },
        {
          title: "Diagram: a diverged branch, then pull with rebase",
          lang: "text",
          code: `
 Before (you committed C locally; a teammate pushed B to GitHub):

   origin/main:   A---B
   main:          A---C          git status -sb  ->  [ahead 1, behind 1]

 git pull   (pull.rebase true: fetch, then replay C on top of B as C')

   origin/main:   A---B
   main:          A---B---C'     git status -sb  ->  [ahead 1]

 git push

   origin/main:   A---B---C'     main and origin/main point at the same commit`,
        },
        {
          title: "A rejected push and the fix (real output)",
          lang: "bash",
          code: `
git push
#  ! [rejected]        main -> main (fetch first)
# hint: Updates were rejected because the remote contains work that you do not
# hint: have locally. This is usually caused by another repository pushing to
# hint: the same ref. If you want to integrate the remote changes, use
# hint: 'git pull' before pushing again.

git pull
# Successfully rebased and updated refs/heads/main.
mvn -q test -Denv=local
git push
#    3de5ab6..d64096b  main -> main`,
        },
        {
          title: "Force-with-lease protecting a teammate's commit",
          lang: "bash",
          code: `
# Your teammate pushed a fix to your branch; you have not fetched since.
git commit --amend -m "Replace single limit test with boundary table"
git push --force-with-lease
#  ! [rejected]        feature/etransfer-per-transfer-boundaries -> ... (stale info)

# Do this instead: get their commit, put yours on top, then force safely
git pull --rebase
git log --oneline -3                       # their commit is there, yours on top
git push --force-with-lease`,
          note: "If you run <code>git fetch</code> and then force, the lease no longer protects you. Check <code>git log HEAD..origin/&lt;branch&gt;</code> first.",
        },
      ],
      exercises: [
        "Push your branch from lesson 3 with <code>-u</code>, then make one more commit and push it with a plain <code>git push</code>. Find both commits on GitHub.",
        "With a teammate: both commit to the same feature branch, one pushes first. The second one's push is rejected; resolve it with <code>git pull</code> (rebase) and push. Write down the exact messages you saw.",
        "After a teammate merges something into <code>main</code>, update your feature branch with <code>git rebase origin/main</code>, run the tests against Ice Bank local, and push with <code>--force-with-lease</code>.",
        "Run <code>git fetch</code> then <code>git status</code> in your Ice Bank clone and report whether you are behind. If you are, pull and restart the app following the steps above.",
        "With a teammate, on a throwaway branch: they push one commit to it; without fetching, you amend your own last commit and try <code>git push --force-with-lease</code>. Record the message. Then integrate their commit and push properly, and explain in two sentences what a plain <code>--force</code> would have done.",
      ],
      quiz: [
        {
          q: "Your <code>git push</code> on the shared <code>main</code> is rejected with \"(fetch first)\". What do you do?",
          options: [
            "<code>git push --force</code>, because your version is newer",
            "<code>git pull</code>, run the tests, then <code>git push</code>",
            "Delete your clone and clone again",
            "Push to a new branch called <code>main2</code>",
          ],
          answer: 1,
          explain: "Someone pushed first. Pulling integrates their commits with yours; a force-push would delete theirs from GitHub.",
        },
        {
          q: "What does setting <code>pull.rebase true</code> change?",
          options: [
            "<code>git pull</code> replays your local commits on top of the fetched ones instead of creating a merge commit",
            "<code>git pull</code> never downloads anything",
            "<code>git push</code> rebases GitHub's branch on yours",
            "It turns off conflict detection",
          ],
          answer: 0,
          explain: "You get a straight history without \"Merge branch 'main' of github.com...\" commits. Conflicts are still detected; you resolve them during the rebase.",
        },
        {
          q: "When is <code>git push --force-with-lease</code> appropriate?",
          options: [
            "Whenever a normal push is rejected",
            "On <code>main</code>, to clean up history",
            "On your own feature branch after you rebased or amended it",
            "Never; it is the same as <code>--force</code>",
          ],
          answer: 2,
          explain: "Rewriting your own branch is normal (rebase on main, amend). The lease refuses if somebody pushed to the branch since your last fetch.",
        },
        {
          q: "<code>git status -sb</code> shows <code>[ahead 2, behind 3]</code>. What is going on?",
          options: [
            "You are 5 commits behind",
            "You have 2 commits GitHub lacks, and GitHub has 3 you lack: the branch has diverged",
            "2 commits failed to push and 3 were rejected",
            "Your clone is corrupt",
          ],
          answer: 1,
          explain: "Diverged branches need <code>git pull</code> (rebase or merge) before you can push without forcing.",
        },
      ],
    },
    // ------------------------------------------------------------------------------------------
    {
      id: "pull-requests",
      title: "Pull requests and review",
      summary: "Propose a change, get it reviewed and merge it into main.",
      body: `
<p>A <strong>pull request</strong> (PR) is a request to merge your branch into <code>main</code>, with a page on GitHub showing the diff, a description and a conversation. It is where
the team's quality bar lives: every test that reaches <code>main</code> has been read by someone else.</p>

<h3>Opening a good PR</h3>
<ul>
<li>Push the branch; GitHub shows a <em>Compare &amp; pull request</em> button.</li>
<li><strong>Title</strong>: what it adds, like a commit message: "Add e-Transfer daily and rolling limit boundary tests".</li>
<li><strong>Description</strong>: what and why, how to run it (<code>mvn test -Dgroups=etransfer -Denv=local</code>), what you verified (green on local, result on QA), anything
reviewers should look at closely.</li>
<li>Keep it small: under ~400 changed lines gets a real review; 2,000 lines gets "LGTM".</li>
<li>Open it as a <strong>Draft</strong> if you want early feedback before it is finished.</li>
</ul>

<h3>Reviewing a teammate's PR</h3>
<p>Check out the branch and <em>run</em> the tests against Ice Bank local; a review that only reads the diff misses half the problems. Then look for:</p>
<ul>
<li>Correct oracle: do the expected values follow the business rules (e.g. $3,000.00 passes, $3,000.01 is <code>422 LIMIT_PER_TRANSFER</code>)?</li>
<li>Independence: does the test create its own data or depend on another test running first?</li>
<li>Assertions that can actually fail (no assertion-free tests, no <code>assertTrue(true)</code>).</li>
<li>Hard-coded environment values, tokens or <code>Thread.sleep</code>.</li>
<li>Naming, duplication, and whether a helper already exists.</li>
</ul>
<p>Comment on lines, suggest changes with GitHub's <em>suggestion</em> blocks, and finish with <em>Approve</em> or <em>Request changes</em>. Be specific and kind: "this would pass even if
the transfer failed, because it only checks the status; can we assert the balance too?" beats "wrong".</p>

<h3>Merging</h3>
<p>Protect <code>main</code> on GitHub (Settings → Branches → branch protection rule): require a pull request and one approval. Use <strong>Squash and merge</strong> for small PRs (one
clean commit on main) or <strong>Rebase and merge</strong> if the individual commits are meaningful. Delete the branch afterwards.</p>
<h3>The PR lifecycle, step by step</h3>
<ol>
<li>Before opening: <code>git fetch</code>, <code>git rebase origin/main</code>, <code>mvn -q test -Denv=local</code> green, <code>git diff origin/main...HEAD</code> read once more.</li>
<li><code>git push -u origin feature/x</code>, then <em>Compare &amp; pull request</em> (or <code>gh pr create</code>). The template (below) fills the description.</li>
<li>Ask for a reviewer. Draft PRs can be opened earlier for feedback.</li>
<li>Reviewer checks it out, runs it, comments using the checklist.</li>
<li>Author answers every comment: a new commit for each fix, then "Done in 3f9c2ab" or a reason for not changing it. Do not resolve a reviewer's thread for them unless your team agreed so.</li>
<li>Approval plus green checks, then merge (squash for most test PRs), delete the branch, everyone pulls main.</li>
</ol>

<h3>Review checklist for Ice Bank tests</h3>
<p>A checklist keeps reviews consistent across three reviewers. The example below is ready to paste into the PR template. The most valuable item for a tester: <strong>would this test
fail if the feature were broken?</strong> Ice Bank's QA build is a good way to check that: a test that passes on local and on QA while the rule it checks is broken on QA is not
testing that rule.</p>

<h3>Comments that get acted on</h3>
<p>Label each comment so the author knows what is required: <code>issue:</code> (must change), <code>suggestion:</code> (would be better), <code>question:</code> (help me understand),
<code>nit:</code> (tiny, optional), <code>praise:</code> (keep doing this). Example: "issue: this passes even if the transfer was never posted, because it only checks 201. Can we assert both
balances and the two <code>transactions</code> rows with the same <code>referenceId</code>?"</p>

<h3>The three merge buttons</h3>
<p><strong>Create a merge commit</strong> keeps every branch commit plus a merge commit. <strong>Squash and merge</strong> turns the whole PR into one commit on main (its subject is the PR
title, so write titles like commit subjects). <strong>Rebase and merge</strong> replays each commit onto main with no merge commit. Squash is the usual choice for small test PRs.</p>`,
      examples: [
        {
          title: "PR description template (save as .github/pull_request_template.md)",
          lang: "markdown",
          code: `
## What
Boundary tests for Interac e-Transfer limits: per transfer, daily, rolling 30 days.

## Why
Week 2 exercise map: boundary and negative tests on e-Transfer limits.

## How to run
mvn test -Dgroups=etransfer -Denv=local

## Verified
- [x] Green on local (clean build)
- [x] Run on QA sandbox 2; failures reported as bugs (IB-21, IB-22)
- [x] No secrets or tokens in the diff

## Notes for reviewers
LimitCalculator reads remaining allowance from SQL; check the Toronto-day logic.`,
        },
        {
          title: "Review a PR locally (GitHub CLI optional)",
          lang: "bash",
          code: `
git fetch
git switch feature/etransfer-limit-tests
mvn -q test -Dgroups=etransfer -Denv=local

# or, with the GitHub CLI installed:
gh pr checkout 12
gh pr review 12 --comment --body "Ran against local: 14 passed. Two comments inline."`,
        },
        {
          title: "Review checklist (add it to .github/pull_request_template.md)",
          lang: "markdown",
          code: `
## Review checklist
- [ ] I checked out the branch and ran it: mvn -q test -Denv=local (result: __ passed)
- [ ] Expected values come from the business rules (README, Swagger), not from whatever the app returned
- [ ] Each test would FAIL if the rule were broken (assert body, balances or DB rows, not only the status)
- [ ] Boundaries are exact: 3000.00 accepted, 3000.01 rejected with the right code
- [ ] Tests create their own data or use seed data a reset restores; no order dependence
- [ ] No Thread.sleep, no hard-coded tokens, sandbox keys or passwords
- [ ] Names say what is checked: perTransferLimitRejectsOneCentOver, not test3
- [ ] Reuses existing helpers (AuthClient, Config, DbChecks) instead of copying them
- [ ] No target/, allure-results/, .idea/ or *.local.properties in the diff`,
        },
        {
          title: "A suggestion block (the author can apply it with one click)",
          lang: "markdown",
          code: `
suggestion: the oracle should not depend on the response we are testing.

\`\`\`suggestion
        BigDecimal expected = before.subtract(new BigDecimal("25.00"));
        assertEquals(0, accounts.get(1).availableBalance().compareTo(expected));
\`\`\``,
          note: "In a review comment on GitHub, click the <em>Add a suggestion</em> icon to get the fenced <code>suggestion</code> block; its lines replace the commented lines.",
        },
        {
          title: "What each merge button does to main",
          lang: "text",
          code: `
 PR branch: C---D on top of B           main: A---B

 Create a merge commit     A---B-------M        (C and D kept, M has two parents)
                                \\     /
                                 C---D

 Squash and merge          A---B---S            (S = C + D as one commit; subject = PR title)

 Rebase and merge          A---B---C'---D'      (each commit replayed, no merge commit)`,
        },
      ],
      exercises: [
        "Turn on branch protection for <code>main</code> in your framework repo: pull request required, one approval required.",
        "Open a pull request for your accounts tests branch using the template, with a clear title and the exact command to run the tests against Ice Bank local.",
        "Review a teammate's PR: check it out, run it against Ice Bank local, and leave at least two specific comments (one can be praise). Approve or request changes.",
        "Address review comments on your own PR with new commits, reply to each comment, then merge with Squash and merge and delete the branch.",
        "Add the review checklist to your PR template. Use it on one teammate PR and, for every item you could not tick, leave a labelled comment (<code>issue:</code>, <code>suggestion:</code>, <code>question:</code> or <code>nit:</code>). Paste links to your comments in your notes.",
      ],
      quiz: [
        {
          q: "A teammate asks you to review their e-Transfer limit tests. What should you do first?",
          options: [
            "Approve quickly so they are not blocked",
            "Check out the branch and run the tests against Ice Bank local",
            "Read only the PR description",
            "Rewrite the tests in your own style",
          ],
          answer: 1,
          explain: "Running the tests catches what reading misses: order dependence, wrong environment config, flaky waits, tests that do not compile.",
        },
        {
          q: "A transfer test only asserts <code>statusCode(201)</code>. Which review comment adds the most value?",
          options: [
            "nit: rename the variable <code>r</code>",
            "praise: nice and short",
            "issue: this passes even if no money moved; please also assert both balances and the transaction rows",
            "question: why REST Assured and not Postman?",
          ],
          answer: 2,
          explain: "The point of a test is to fail when the feature is broken. A status-only check misses wrong balances, missing rows and wrong amounts.",
        },
        {
          q: "What does <em>Squash and merge</em> put on <code>main</code>?",
          options: [
            "All the PR's commits plus a merge commit",
            "One new commit containing all the PR's changes, with the PR title as its subject",
            "Nothing until someone runs <code>git rebase</code>",
            "Only the last commit of the PR",
          ],
          answer: 1,
          explain: "That is why PR titles should be written like good commit subjects: they become the history of main.",
        },
        {
          q: "Your PR has grown to 2,000 changed lines. What is the best move?",
          options: [
            "Ask for a quick LGTM",
            "Split it: framework changes in one PR, then the tests that use them in smaller PRs",
            "Merge it yourself to save time",
            "Turn off branch protection",
          ],
          answer: 1,
          explain: "Big PRs get shallow reviews and painful conflicts. Small PRs are reviewed properly and merged faster.",
        },
      ],
    },
    // ------------------------------------------------------------------------------------------
    {
      id: "merge-conflicts",
      title: "Merge conflicts",
      summary: "Why they happen, how to read the markers and how to resolve them calmly.",
      body: `
<p>A <strong>conflict</strong> happens when two branches changed the <em>same lines</em> of the same file (or one deleted a file the other edited) and Git cannot decide which
version wins. It is not an error and nothing is lost: Git stops and asks you. Conflicts are most common in shared files: the base test class, <code>pom.xml</code>, config files
and page objects.</p>

<h3>Reading the markers</h3>
<p>Git writes both versions into the file:</p>
<ul>
<li>From <code>&lt;&lt;&lt;&lt;&lt;&lt;&lt; HEAD</code> to <code>=======</code>: your side (the branch you are on, or during a rebase: the commits you are replaying onto).</li>
<li>From <code>=======</code> to <code>&gt;&gt;&gt;&gt;&gt;&gt;&gt; other</code>: the incoming side.</li>
</ul>
<p>Your job is to edit the file into the version that is <em>correct</em>: often a combination of both, not simply one side. Then delete the markers, <code>git add</code> the file,
and continue: <code>git commit</code> for a merge, <code>git rebase --continue</code> for a rebase. Run the tests before you continue: a conflict resolved so that it compiles can
still be wrong.</p>

<h3>Tools</h3>
<p>IntelliJ's <em>Git → Resolve Conflicts</em> shows three panes (yours, result, theirs) with buttons to take changes from either side. It is far easier than editing markers by hand.
<code>git status</code> lists which files are still unmerged.</p>

<h3>Escape hatches</h3>
<p><code>git merge --abort</code> or <code>git rebase --abort</code> puts everything back as it was before you started. Use it whenever you are unsure, then ask for help.</p>

<h3>Avoiding conflicts</h3>
<ul>
<li>Pull/rebase from <code>main</code> often, so differences stay small.</li>
<li>Keep branches short and PRs small.</li>
<li>Split big shared files: one page object per page, one test class per feature, one config file per environment.</li>
<li>Tell the team when you are about to refactor a shared class.</li>
</ul>
<h3>Worked example: a conflict in a Java test file, step by step</h3>
<p>This is a real conflict, reproduced in a scratch repository. Student A tagged the e-Transfer limit test with <code>@Tag("etransfer")</code>; that PR was merged. Meanwhile Student B, on
<code>feature/etransfer-per-transfer-boundaries</code>, replaced the same single test with a parameterised boundary table. B now updates the branch:</p>
<ol>
<li><strong>Start the update</strong>: <code>git fetch</code>, <code>git rebase origin/main</code>. Git stops: <code>CONFLICT (content): Merge conflict in src/test/java/com/icebank/api/ETransferLimitTest.java</code>.</li>
<li><strong>See what is unmerged</strong>: <code>git status</code> lists it under <em>Unmerged paths</em> as <code>both modified</code>. (<code>git diff --name-only --diff-filter=U</code> lists only those files.)</li>
<li><strong>Read both sides</strong> (example 3 below). Note the labels: during a <em>rebase</em>, the <code>HEAD</code> side is main's version (A's tag) and the other side is <em>your</em>
commit being replayed. During a <em>merge</em> it is the other way round. Git also merged the import lines on its own, because they did not overlap.</li>
<li><strong>Understand the intent of each side</strong>. A: "this test belongs to the etransfer group". B: "test three boundaries instead of one". Both are right, so the correct
result is B's parameterised test <em>with</em> A's tag. Taking either side alone would lose a teammate's work.</li>
<li><strong>Edit the file</strong> into that result and delete all three marker lines. Then tidy what the combination broke: <code>import org.junit.jupiter.api.Test;</code> is now
unused.</li>
<li><strong>Check for leftovers</strong>: search for <code>&lt;&lt;&lt;&lt;&lt;&lt;&lt;</code>, <code>=======</code> and <code>&gt;&gt;&gt;&gt;&gt;&gt;&gt;</code> in the project (IntelliJ: Find in Files).</li>
<li><strong>Prove it</strong>: <code>mvn -q test -Dtest=ETransferLimitTest -Denv=local</code>. Compiling is not enough; the tests must pass and still be tagged
(<code>mvn -q test -Dgroups=etransfer -Denv=local</code> should run them).</li>
<li><strong>Mark resolved and continue</strong>: <code>git add</code> the file, <code>git rebase --continue</code> (Git opens your editor for the message; save and close), then
<code>git push --force-with-lease</code> because the branch was rewritten.</li>
<li><strong>Tell the reviewer</strong> in the PR: "Rebased on main; kept A's etransfer tag on the new parameterised test."</li>
</ol>

<h3>See the common ancestor (zdiff3)</h3>
<p>Two sides are often not enough to understand a conflict; you want to know what the line looked like <em>before</em> either change. Turn on the three-way style once:
<code>git config --global merge.conflictStyle zdiff3</code> (Git 2.35 or newer; use <code>diff3</code> on older versions). Conflicts then show a third section,
<code>||||||| base</code>, with the original lines. For a conflict that is already in your file, <code>git checkout --conflict=zdiff3 &lt;file&gt;</code> rewrites the markers in
that style (it discards any half-done resolution in that file).</p>`,
      examples: [
        {
          title: "A typical conflict in a shared config file",
          lang: "text",
          code: `
# src/test/resources/config/local.properties
baseUrl=http://localhost:3000
<<<<<<< HEAD
apiBasePath=/api/v1
timeoutSeconds=15
=======
apiBasePath=/api/v1
sandboxId=1
>>>>>>> origin/main`,
          note: "The correct resolution keeps both new keys: <code>timeoutSeconds=15</code> and <code>sandboxId=1</code>.",
        },
        {
          title: "Resolving during a rebase",
          lang: "bash",
          code: `
git fetch
git rebase origin/main
# CONFLICT (content): Merge conflict in src/test/resources/config/local.properties
git status                         # shows "both modified"
# edit the file (or use IntelliJ: Git > Resolve Conflicts), remove the markers
git add src/test/resources/config/local.properties
mvn -q test -Denv=local
git rebase --continue
git push --force-with-lease

# if it goes wrong at any point:
git rebase --abort`,
        },
        {
          title: "Step 1-2: the rebase stops (real output)",
          lang: "bash",
          code: `
git fetch
git rebase origin/main
# Auto-merging src/test/java/com/icebank/api/ETransferLimitTest.java
# CONFLICT (content): Merge conflict in src/test/java/com/icebank/api/ETransferLimitTest.java
# error: could not apply 4dd1940... Replace single limit test with boundary table

git status
# You are currently rebasing branch 'feature/etransfer-per-transfer-boundaries' on '5161ff7'.
# Unmerged paths:
#         both modified:   src/test/java/com/icebank/api/ETransferLimitTest.java`,
        },
        {
          title: "Step 3: the conflict in the Java file, with the base section (zdiff3)",
          lang: "java",
          code: `
package com.icebank.api;

import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

class ETransferLimitTest {

<<<<<<< ours
    @Test
    @Tag("etransfer")
    void perTransferLimitAcceptsExactlyThreeThousand() {
        send("3000.00").then().statusCode(201);
||||||| base
    @Test
    void perTransferLimitAcceptsExactlyThreeThousand() {
        send("3000.00").then().statusCode(201);
=======
    @ParameterizedTest(name = "{0} -> {1}")
    @CsvSource({"0.01, 201", "3000.00, 201", "3000.01, 422"})
    void perTransferLimitBoundaries(String amount, int status) {
        send(amount).then().statusCode(status);
>>>>>>> theirs
    }
}`,
          note: "During a rebase, \"ours\" is main (Student A's tag) and \"theirs\" is the commit being replayed (Student B's change). Compared with the base, A only added <code>@Tag</code>, while B rewrote the method. (With the setting turned on before the rebase, the three labels read <code>HEAD</code>, <code>parent of 4dd1940 (...)</code> and <code>4dd1940 (...)</code> instead of ours, base and theirs.)",
        },
        {
          title: "Steps 5-8: the resolved file and the commands",
          lang: "java",
          code: `
package com.icebank.api;

import org.junit.jupiter.api.Tag;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

class ETransferLimitTest {

    @ParameterizedTest(name = "{0} -> {1}")
    @CsvSource({"0.01, 201", "3000.00, 201", "3000.01, 422"})
    @Tag("etransfer")
    void perTransferLimitBoundaries(String amount, int status) {
        send(amount).then().statusCode(status);
    }
}

// then, in the terminal:
//   git grep -n -e "<<<<<<<" -e ">>>>>>>"        (no output = no markers left)
//   mvn -q test -Dgroups=etransfer -Denv=local
//   git add src/test/java/com/icebank/api/ETransferLimitTest.java
//   git rebase --continue
//   git push --force-with-lease`,
          note: "The unused <code>Test</code> import is removed: a combined resolution often leaves small leftovers that neither side had.",
        },
      ],
      exercises: [
        "Create a conflict on purpose with a teammate: both change the same line of <code>local.properties</code> on different branches; merge one PR, then rebase the other. Resolve it by hand with the markers.",
        "Create a second conflict in a Java test class and resolve it with IntelliJ's three-pane tool. Run the affected tests against Ice Bank local before you continue the rebase.",
        "Start a rebase that conflicts and use <code>git rebase --abort</code>. Confirm with <code>git log</code> and <code>git status</code> that nothing changed.",
        "Run <code>git config --global merge.conflictStyle zdiff3</code>, create a small conflict in a scratch repository, and show it with the <code>||||||| base</code> section (or rewrite an existing conflict with <code>git checkout --conflict=zdiff3 &lt;file&gt;</code>). In two sentences, say what each side changed compared with the base, and what the correct resolution is.",
      ],
      quiz: [
        {
          q: "During <code>git rebase origin/main</code>, what is between <code>&lt;&lt;&lt;&lt;&lt;&lt;&lt; HEAD</code> and <code>=======</code>?",
          options: [
            "Your commit that is being replayed",
            "The version on <code>origin/main</code> (plus any of your commits already replayed)",
            "The common ancestor",
            "Whatever IntelliJ last saved",
          ],
          answer: 1,
          explain: "A rebase checks out main and replays your commits onto it, so HEAD is main's side. In a merge, HEAD is your branch. This swap confuses everyone once.",
        },
        {
          q: "You removed all markers from the conflicted file. What is the correct order of the next steps during a rebase?",
          options: [
            "<code>git commit -am \"fix\"</code>, then <code>git push --force</code>",
            "Run the affected tests, <code>git add</code> the file, <code>git rebase --continue</code>",
            "<code>git rebase --skip</code>",
            "<code>git restore</code> the file, then <code>git rebase --continue</code>",
          ],
          answer: 1,
          explain: "<code>git add</code> marks the file resolved; <code>--continue</code> finishes the replay. <code>--skip</code> would drop your commit and <code>restore</code> would undo your resolution.",
        },
        {
          q: "Main added <code>@Tag(\"etransfer\")</code> to a test; your branch turned the same test into a parameterised test. What is the correct resolution?",
          options: [
            "Keep main's version; it was merged first",
            "Keep your version; it is newer",
            "Keep your parameterised test and add the tag, then remove anything the combination left unused",
            "Keep both methods so nothing is lost",
          ],
          answer: 2,
          explain: "Resolve by intent: both changes were wanted. Keeping both methods would duplicate the test; picking one side silently loses a teammate's work.",
        },
        {
          q: "With <code>merge.conflictStyle zdiff3</code>, what does the <code>||||||| base</code> section show?",
          options: [
            "The lines as they were before either side changed them",
            "The lines on GitHub",
            "A suggested resolution",
            "Lines that were deleted on both sides",
          ],
          answer: 0,
          explain: "Comparing each side with the base tells you what each person actually changed, which makes the right combination obvious.",
        },
        {
          q: "Halfway through resolving, you are no longer sure what the right result is. What is the safe move?",
          options: [
            "<code>git reset --hard</code>",
            "<code>git rebase --abort</code>, then ask the teammate who changed the other side",
            "Delete the file and continue",
            "Force-push what you have",
          ],
          answer: 1,
          explain: "Abort puts the branch back exactly as before the rebase. Nothing is lost, and you can try again with more information.",
        },
      ],
    },
    // ------------------------------------------------------------------------------------------
    {
      id: "gitignore",
      title: ".gitignore for target/ and secrets",
      summary: "Keep build output, IDE files, reports and credentials out of the repository for good.",
      body: `
<p><code>.gitignore</code> is a file at the root of the repository listing patterns Git should not track. Untracked files that match are hidden from <code>git status</code> and
skipped by <code>git add</code>. It belongs in the very first commit.</p>

<h3>What a Java test framework must ignore</h3>
<ul>
<li><strong>Build output</strong>: <code>target/</code> (Maven) or <code>build/</code> and <code>.gradle/</code> (Gradle). It is regenerated on every build and huge.</li>
<li><strong>IDE files</strong>: <code>.idea/</code>, <code>*.iml</code>, <code>.vscode/</code>, <code>out/</code>. Personal settings that cause pointless conflicts.</li>
<li><strong>Reports</strong>: <code>allure-results/</code>, <code>allure-report/</code>, <code>test-output/</code> (TestNG), <code>*.log</code>, screenshots and downloaded CSV/PDF files from test runs.</li>
<li><strong>OS junk</strong>: <code>Thumbs.db</code>, <code>.DS_Store</code>.</li>
<li><strong>Secrets</strong>: <code>.env</code>, <code>*.local.properties</code>, <code>config/qa.properties</code> if it holds your QA sandbox key or the Supabase password, Postman environment
exports.</li>
</ul>

<h3>Patterns</h3>
<p><code>target/</code> (a folder anywhere), <code>/secrets.properties</code> (only at the root), <code>*.log</code> (any file ending .log), <code>!example.properties</code> (exception:
do track this one). Lines starting with <code>#</code> are comments.</p>

<h3>Already committed? Ignoring is not enough</h3>
<p><code>.gitignore</code> only affects <em>untracked</em> files. If <code>target/</code> is already committed, run <code>git rm -r --cached target</code> (removes it from the repository,
keeps it on disk) and commit. Check what is ignored with <code>git check-ignore -v path</code>.</p>

<div class="callout warn"><p><strong>If a secret was pushed</strong>, deleting it in a new commit does not help: it is still in the history and on GitHub. Treat it as leaked: tell the
instructor so the QA sandbox key or password can be changed, then remove it from your config. For local-only Ice Bank values (<code>ICEBANK-LOCAL-KEY</code>,
<code>qa_reader</code>/<code>qa_reader</code>) there is no harm, they are public by design; QA values are the ones that matter.</p></div>
<p>The pattern that works: commit a template such as <code>config/qa.example.properties</code> with placeholder values, ignore the real <code>config/qa.properties</code>, and document
in the README how to create it (Tutorial 6, lesson 3).</p>
<h3>Step by step: add .gitignore to a Maven test project</h3>
<ol>
<li>Create <code>.gitignore</code> at the repository root (next to <code>pom.xml</code>) in IntelliJ, with at least: <code>target/</code>, <code>allure-results/</code>, <code>*.local.properties</code>,
<code>.idea/</code>. (The full version is in the first example.)</li>
<li>Build and run once so the files exist: <code>mvn -q test -Denv=local</code>.</li>
<li><code>git status</code> should list only <code>.gitignore</code> and your real source changes. Nothing under <code>target/</code>, no <code>.idea/</code>.</li>
<li>See what is being ignored: <code>git status --short --ignored</code> prints ignored paths with <code>!!</code>. Git shows a whole folder (<code>!! target/</code>) when everything in it is
ignored.</li>
<li>Ask why a specific file is ignored: <code>git check-ignore -v &lt;path&gt;</code> prints the file, line number and pattern that matched. No output (exit code 1) means not ignored.</li>
<li>Commit <code>.gitignore</code> on its own: <code>git add .gitignore</code>, <code>git commit -m "Ignore build output, reports, IDE files and local config"</code>.</li>
</ol>

<h3>Pattern details that bite</h3>
<div class="table-wrap"><table>
<thead><tr><th>Pattern</th><th>Matches</th><th>Watch out</th></tr></thead>
<tbody>
<tr><td><code>target/</code></td><td>Any folder called target, at any depth</td><td>The trailing slash means "folder only"; a file named <code>target</code> would not match.</td></tr>
<tr><td><code>/target/</code></td><td>Only the root folder</td><td>In a multi-module Maven build each module has its own <code>target/</code>; use <code>target/</code>.</td></tr>
<tr><td><code>*.local.properties</code></td><td><code>emma.local.properties</code> in any folder</td><td>A pattern without a slash matches at every depth.</td></tr>
<tr><td><code>src/test/resources/config/qa.properties</code></td><td>Exactly that file</td><td>A pattern with a slash in the middle is relative to the <code>.gitignore</code>'s folder.</td></tr>
<tr><td><code>target/</code> then <code>!target/keep.txt</code></td><td>keep.txt is <em>still ignored</em></td><td>Git does not look inside an ignored folder, so it cannot un-ignore a file in it. Use <code>target/*</code> then <code>!target/keep.txt</code>.</td></tr>
<tr><td><code>logs/*</code> then <code>!logs/.gitkeep</code></td><td>Every log ignored; the empty <code>.gitkeep</code> tracked</td><td>Git does not track empty folders; this keeps <code>logs/</code> in the repo.</td></tr>
</tbody></table></div>
<p><code>git check-ignore -v</code> also prints lines starting with <code>!</code>: that output means "a negation pattern matched, so this file is <em>not</em> ignored". Read the pattern, not
just the exit code.</p>

<h3>Personal ignores that do not belong in the team file</h3>
<p>Your OS and editor junk (<code>.DS_Store</code>, <code>Thumbs.db</code>, a scratch folder) can go in a global ignore file instead of the shared one:
<code>git config --global core.excludesFile ~/.gitignore_global</code> (PowerShell: <code>"$HOME\\.gitignore_global"</code>). For one repository only, use <code>.git/info/exclude</code>,
which is never committed.</p>`,
      examples: [
        {
          title: ".gitignore for an Ice Bank test framework (Maven, IntelliJ, Allure)",
          lang: "gitignore",
          code: `
# Build output
target/
build/
.gradle/
out/

# IDE
.idea/
*.iml
.vscode/

# Test reports and artefacts
allure-results/
allure-report/
test-output/
logs/
*.log
screenshots/
downloads/

# Secrets and personal config (commit the *.example.* templates instead)
.env
*.local.properties
src/test/resources/config/qa.properties
postman/*environment*.json
!postman/icebank-local.postman_environment.json

# OS
Thumbs.db
.DS_Store`,
        },
        {
          title: "Clean up files that were committed before the .gitignore existed",
          lang: "bash",
          code: `
git rm -r --cached target .idea
git commit -m "Stop tracking build output and IDE files"
git check-ignore -v target/surefire-reports/TEST-HealthTest.xml`,
        },
        {
          title: "Search the whole history for a leaked value",
          lang: "bash",
          code: `
git log -p --all -S "SANDBOX-KEY-FRAGMENT" --oneline
git grep -n "postgresql://" $(git rev-list --all) -- '*.properties' | head`,
        },
        {
          title: "Prove the .gitignore works (real output)",
          lang: "bash",
          code: `
git status --short --ignored
# !! .idea/
# !! allure-results/
# !! src/test/resources/config/emma.local.properties
# !! target/

git check-ignore -v target/surefire-reports/TEST-HealthTest.xml \\
  allure-results/x-result.json src/test/resources/config/emma.local.properties .idea/workspace.xml
# .gitignore:2:target/              target/surefire-reports/TEST-HealthTest.xml
# .gitignore:9:allure-results/      allure-results/x-result.json
# .gitignore:13:*.local.properties  src/test/resources/config/emma.local.properties
# .gitignore:5:.idea/               .idea/workspace.xml

git check-ignore -v pom.xml        # no output, exit code 1: pom.xml is not ignored (good)`,
          note: "In PowerShell, put the <code>check-ignore</code> paths on one line (the trailing backslash is Bash's line continuation; PowerShell uses a backtick).",
        },
        {
          title: "Keeping a folder but not its contents",
          lang: "gitignore",
          code: `
# Keep logs/ in the repository (empty), ignore everything written into it
logs/*
!logs/.gitkeep

# Does NOT work: Git never looks inside an ignored folder
#   target/
#   !target/keep.txt
# Works:
target/*
!target/keep.txt`,
        },
        {
          title: "Creating .gitignore from the terminal",
          lang: "bash",
          code: `
# Git Bash, macOS, Linux
printf 'target/\\nallure-results/\\n*.local.properties\\n.idea/\\n' >> .gitignore

# Windows PowerShell (5.1 and 7): write plain ASCII, never UTF-16
Add-Content -Encoding ascii .gitignore "target/", "allure-results/", "*.local.properties", ".idea/"

# Either: check that Git reads it
git check-ignore -v target/`,
          note: "Simplest of all: create and edit the file in IntelliJ, which saves UTF-8.",
        },
      ],
      exercises: [
        "Add the <code>.gitignore</code> above to your framework repo, run <code>mvn test -Denv=local</code> and an Allure report, and confirm <code>git status</code> shows nothing from <code>target/</code> or <code>allure-results/</code>.",
        "Create <code>config/qa.example.properties</code> with placeholders and an ignored <code>config/qa.properties</code> with your real QA values. Prove with <code>git check-ignore -v</code> that the real file is ignored.",
        "Search your repository's history for anything that looks like a QA sandbox key, a token (<code>eyJ</code>) or a Supabase connection string. Report what you find to your team (and the instructor if it is a QA secret).",
        "Make <code>logs/</code> part of the repository while every file written into it stays untracked (<code>logs/*</code> plus <code>!logs/.gitkeep</code>). Prove it with <code>git status --short --ignored</code> and <code>git check-ignore -v</code>, and explain why <code>logs/</code> followed by <code>!logs/.gitkeep</code> would not work.",
      ],
      quiz: [
        {
          q: "<code>target/</code> was committed before the <code>.gitignore</code> existed. You add <code>target/</code> to <code>.gitignore</code>, but <code>git status</code> still shows changed files under <code>target/</code>. Why, and what fixes it?",
          options: [
            "The pattern needs to be <code>/target</code>",
            "<code>.gitignore</code> only affects untracked files; run <code>git rm -r --cached target</code> and commit",
            "Git caches <code>.gitignore</code>; restart IntelliJ",
            "Delete the <code>target</code> folder from disk",
          ],
          answer: 1,
          explain: "Tracked files stay tracked whatever <code>.gitignore</code> says. <code>--cached</code> removes them from the repository while keeping them on disk.",
        },
        {
          q: "Which single pattern ignores <code>src/test/resources/config/emma.local.properties</code> and every other personal <code>*.local.properties</code> file?",
          options: ["<code>/emma.local.properties</code>", "<code>local.properties</code>", "<code>*.local.properties</code>", "<code>*.properties.local</code>"],
          answer: 2,
          explain: "A pattern without a slash matches at any depth. <code>/emma...</code> matches only at the root, and the other two do not match the name.",
        },
        {
          q: "Your <code>.gitignore</code> has <code>target/</code> and then <code>!target/keep.txt</code>. Is <code>target/keep.txt</code> tracked?",
          options: [
            "Yes, the later line wins",
            "No: Git does not look inside an ignored folder, so the exception never applies",
            "Only after <code>git add -f</code> each time",
            "Only on Windows",
          ],
          answer: 1,
          explain: "Ignore the folder's contents instead (<code>target/*</code>), then the exception works.",
        },
        {
          q: "You pushed a properties file containing your QA sandbox key. What is the right response?",
          options: [
            "Delete the file in a new commit; the problem is solved",
            "Make the repository private",
            "Treat the key as leaked: tell the instructor so it can be replaced, move the real value to an ignored file, commit a template with placeholders",
            "Amend the commit and push again",
          ],
          answer: 2,
          explain: "The value stays in history (and in every clone) whatever you do afterwards. Only replacing the secret makes the leak harmless.",
        },
      ],
    },
    // ------------------------------------------------------------------------------------------
    {
      id: "commit-messages",
      title: "Commit messages",
      summary: "Write messages your teammates (and you in three weeks) can actually use.",
      body: `
<p>A commit message is the only documentation of <em>why</em> a change was made. <code>git log</code>, <code>git blame</code> and the PR history are only as useful as these messages.
"fix", "wip" and "changes" make history useless.</p>

<h3>The format</h3>
<ul>
<li><strong>Subject line</strong>: up to about 50–72 characters, imperative mood ("Add", "Fix", "Remove", not "Added" or "Fixes"), no full stop. It completes the sentence
"If applied, this commit will…".</li>
<li><strong>Blank line</strong>, then an optional <strong>body</strong> wrapped at ~72 characters: what changed and <em>why</em>, especially anything not obvious from the diff (a business
rule, a bug id, a workaround).</li>
<li>Reference the ticket or bug if you have one: <code>Refs IB-42</code>.</li>
</ul>

<h3>Conventional prefixes (optional, but agree as a team)</h3>
<p>Many teams prefix the subject with a type: <code>test:</code> new or changed tests, <code>fix:</code> a broken test or helper, <code>feat:</code> a framework feature,
<code>refactor:</code>, <code>chore:</code> build or dependencies, <code>docs:</code>. Example: <code>test: cover e-Transfer rolling 30-day limit boundary</code>.</p>

<h3>Good and bad, from an Ice Bank framework</h3>
<div class="table-wrap"><table>
<thead><tr><th>Bad</th><th>Better</th></tr></thead>
<tbody>
<tr><td><code>fix test</code></td><td><code>Wait for transfer-processing to disappear before reading confirmation</code></td></tr>
<tr><td><code>changes</code></td><td><code>Read OTP from Ice Mail API instead of the UI inbox</code></td></tr>
<tr><td><code>added stuff for etransfer</code></td><td><code>Add boundary tests for $3,000 per-transfer e-Transfer limit</code></td></tr>
<tr><td><code>wip</code></td><td>(squash it before the PR is merged)</td></tr>
</tbody></table></div>
<h3>Anatomy of a good message</h3>
<p>Line 1 is what <code>git log --oneline</code>, GitHub and squash merges show, so it must make sense on its own. Lines 3 and on are for the reader who runs <code>git blame</code> in
three weeks and wonders why the expected value is <code>"2999.99"</code>. A body is worth writing whenever the <em>why</em> is not obvious from the diff: a business rule, a bug id, a
decision ("we assert the DB row, not the UI, because the toast disappears after 4 seconds").</p>

<h3>Writing messages in an editor</h3>
<p><code>-m</code> is fine for one line. For a subject plus body, run <code>git commit</code> without <code>-m</code> and Git opens your editor. Choose it once:
<code>git config --global core.editor "code --wait"</code> (VS Code), or <code>notepad</code> on Windows; save and close the file to finish the commit. Lines starting with
<code>#</code> are ignored. IntelliJ's commit window works too and shows a ruler at 72 characters.</p>

<h3>Messages for undo commits</h3>
<p><code>git revert</code> writes <code>Revert "&lt;original subject&gt;"</code> and <code>This reverts commit &lt;id&gt;.</code> for you. Add one line saying <em>why</em>
("timeout of 1 s made every OTP wait fail on QA"); otherwise the next person may re-apply the same change.</p>

<h3>Squash merges and PR titles</h3>
<p>With <em>Squash and merge</em>, the PR title becomes the commit subject on main and the individual messages end up in the body. So the PR title deserves the same care: imperative,
specific, under about 72 characters.</p>`,
      examples: [
        {
          title: "A commit with subject and body",
          lang: "bash",
          code: `
git commit -m "Count pending e-Transfers in daily limit oracle" -m "The limit check in LimitCalculator ignored PENDING transfers, so the
expected remaining allowance was too high when Emma had a pending
transfer to Marc Dupont. Ice Bank counts PENDING and DEPOSITED toward
both the daily and the rolling 30-day limit (PLAN.md).

Refs IB-17"`,
        },
        {
          title: "Find history by message or by line",
          lang: "bash",
          code: `
git log --oneline --grep="e-Transfer"
git log -L '/void dailyLimitBoundary/,+20:src/test/java/com/icebank/api/ETransferLimitTest.java'
git blame -L 40,60 src/test/java/com/icebank/api/ETransferLimitTest.java`,
        },
        {
          title: "The shape of a message (what your editor should contain)",
          lang: "text",
          code: `
Assert DB rows for cancelled e-Transfer refunds
                                                     <- blank line
The UI toast disappears after 4 seconds, so checking it was flaky.
The test now reads the REVERSAL transaction for the reference id
and the e-Transfer status directly from the database.

Refs #18
# Lines starting with '#' are ignored. Subject <= ~50-72 chars, body wrapped at ~72.`,
        },
        {
          title: "A revert that explains itself",
          lang: "bash",
          code: `
git revert fcc894d          # editor opens with the generated message; add the reason:

# Revert "Lower timeout to 1 second"
#
# This reverts commit fcc894d.
# Every OTP wait timed out on QA, where e-mails take 2-3 seconds.`,
        },
      ],
      exercises: [
        "Rewrite these messages properly: \"fix\", \"tests\", \"updated config for qa\", \"Changed the login\". Invent plausible details from Ice Bank.",
        "Agree with your team on a message convention (with or without prefixes) and write three examples of it in the framework README.",
        "Run <code>git log --oneline -20</code> on your framework repo and pick the two weakest messages. Write what they should have said in your notes (do not rewrite pushed history).",
      ],
      quiz: [
        {
          q: "Which is the best commit subject?",
          options: [
            "<code>fixed tests</code>",
            "<code>Wait for the transfer processing state to end before reading the confirmation</code>",
            "<code>Updated TransferPage.java and TransferTest.java</code>",
            "<code>wip</code>",
          ],
          answer: 1,
          explain: "Imperative, specific, about the behaviour. File names are already in the diff, and \"fixed tests\" says nothing about what or why.",
        },
        {
          q: "Why use the imperative mood (\"Add\", not \"Added\")?",
          options: [
            "Git rejects other forms",
            "It completes the sentence \"If applied, this commit will ...\", matching Git's own messages such as \"Revert\" and \"Merge\"",
            "It is shorter",
            "GitHub only shows imperative subjects",
          ],
          answer: 1,
          explain: "It is a convention, not a rule enforced by Git, but it makes history read consistently.",
        },
        {
          q: "When is a message body (after the blank line) most valuable?",
          options: [
            "Always: repeat the diff in words",
            "When the reason is not visible in the diff: a business rule, a bug id, a trade-off",
            "Never: bodies are hidden on GitHub",
            "Only for merge commits",
          ],
          answer: 1,
          explain: "The diff shows what changed; only the message can say why. That is what <code>git blame</code> readers need.",
        },
        {
          q: "Your team uses Squash and merge. What becomes the subject of the commit on main?",
          options: ["The first commit's subject", "The last commit's subject", "The PR title", "The branch name"],
          answer: 2,
          explain: "So write PR titles like commit subjects; the individual commit messages are kept in the body.",
        },
      ],
    },
    // ------------------------------------------------------------------------------------------
    {
      id: "team-workflow",
      title: "A team workflow",
      summary: "Put it all together: how three testers share one framework day to day.",
      body: `
<p>Tools only help if everyone uses them the same way. Here is a simple workflow that fits three people building one Ice Bank framework over three weeks. Adapt it, write
your version in the README, and stick to it.</p>

<h3>The rules</h3>
<ol>
<li><code>main</code> is protected and always green against Ice Bank <strong>local</strong>. (QA is allowed to be red: it has bugs on purpose.)</li>
<li>Every change goes through a short-lived branch and a pull request with one approval.</li>
<li>One PR = one idea. Framework changes (base classes, config, helpers) go in their own PR before the tests that use them.</li>
<li>The author runs the full suite against local before asking for review, and the reviewer runs it again.</li>
<li>Update your branch from <code>main</code> at least once a day.</li>
<li>No secrets, no <code>target/</code>, no reports in commits.</li>
<li>Delete merged branches.</li>
</ol>

<h3>A day in the workflow</h3>
<ol>
<li>Morning: <code>git switch main</code>, <code>git pull</code>; pull the Ice Bank repo too if the instructor announced an update. Quick stand-up: who touches which shared files today?</li>
<li>Branch: <code>git switch -c feature/bill-payment-scheduling-tests</code>.</li>
<li>Work in small commits. Push by lunchtime, even as a Draft PR.</li>
<li>Rebase on <code>origin/main</code>, run all tests against local, open/ready the PR.</li>
<li>Review each other's PRs before starting new work: unreviewed PRs are the bottleneck.</li>
<li>Merge, delete the branch, pull <code>main</code>.</li>
</ol>

<h3>Splitting the work</h3>
<p>Split by feature area so you rarely touch the same files: one person on auth and accounts, one on transfers and e-Transfers, one on bill payments and the DB utilities. Shared
pieces (the <code>AuthClient</code> that signs in with OTP, the config loader, the JDBC helper) get one owner who builds them first; the others review.</p>

<h3>Tracking</h3>
<p>Use GitHub Issues (or your Jira board, Tutorial 5) for tasks and bugs; link PRs with "Closes #12" in the description so merging closes the issue.</p>
<h3>A worked week: three students, one framework</h3>
<p>The roles from the README example: A owns auth and accounts, B transfers and e-Transfers, C bill payments and the DB utilities. Here is a realistic Monday to Wednesday,
including the conflict everyone hits once.</p>
<div class="table-wrap"><table>
<thead><tr><th>When</th><th>A</th><th>B</th><th>C</th></tr></thead>
<tbody>
<tr><td>Mon a.m.</td><td><code>chore/maven-skeleton</code>: <code>pom.xml</code>, <code>.gitignore</code>, PR template. Merged first so everyone builds the same way.</td><td>Reviews A's PR, runs <code>mvn -q test</code> on a fresh clone.</td><td>Reviews A's PR on Windows (line endings, PowerShell commands).</td></tr>
<tr><td>Mon p.m.</td><td><code>feature/auth-client-otp</code>: <code>AuthClient</code> that signs in and reads the OTP from Ice Mail.</td><td>Waits for <code>AuthClient</code>; meanwhile writes the e-Transfer test design (Tutorial 5) in the PR description draft.</td><td><code>feature/db-checks</code>: JDBC helper with <code>qa_reader</code>.</td></tr>
<tr><td>Tue a.m.</td><td>Merges <code>AuthClient</code> after B's review.</td><td><code>feature/etransfer-per-transfer-boundaries</code> from fresh main.</td><td>Merges <code>DbChecks</code> after A's review.</td></tr>
<tr><td>Tue p.m.</td><td><code>chore/tag-suites</code>: adds <code>@Tag</code> to every existing test class, including <code>ETransferLimitTest</code>. Merged.</td><td>Rebases: conflict in <code>ETransferLimitTest.java</code>; resolves it (lesson 6), pushes with lease, notes it in the PR.</td><td>Reviews B's PR with the checklist, finds a status-only assertion, requests changes.</td></tr>
<tr><td>Wed</td><td>Reviews C's bill payment PR.</td><td>Adds balance and DB assertions; C approves; squash-merged.</td><td>Retro note: "tagging every class touched everyone's files; announce such PRs in stand-up".</td></tr>
</tbody></table></div>

<h3>Protecting shared code</h3>
<p>Branch protection (Settings → Branches) makes every change go through a PR. A <code>CODEOWNERS</code> file adds "and the owner of that code must approve": GitHub requests a review from
the listed person automatically when a PR touches matching files, and with <em>Require review from Code Owners</em> ticked in the protection rule, their approval is required.</p>

<h3>When main goes red</h3>
<ol>
<li>Stop merging other PRs; say so in the team chat.</li>
<li>Find the culprit: the last merged PRs, or <code>git log --oneline -10 origin/main</code>, and run the suite on the commit before.</li>
<li>If the fix is not obvious within 15 minutes, revert: GitHub's <em>Revert</em> button on the merged PR creates a revert PR; or locally <code>git revert -m 1 &lt;merge-id&gt;</code> for a merge
commit (plain <code>git revert &lt;id&gt;</code> for a squash commit) on a branch and open a PR.</li>
<li>Main green again, the author fixes forward on a new branch. Remember: only red on <strong>local</strong> counts; QA is red on purpose wherever the instructor planted bugs.</li>
</ol>`,
      examples: [
        {
          title: "The daily loop as commands",
          lang: "bash",
          code: `
git switch main && git pull
git switch -c feature/bill-payment-scheduling-tests
# ...code, then:
git add -p && git commit -m "Add weekend posting-date tests for scheduled bill payments"
git push -u origin feature/bill-payment-scheduling-tests
gh pr create --draft --fill            # optional GitHub CLI
# end of day:
git fetch && git rebase origin/main && mvn -q test -Denv=local && git push --force-with-lease`,
        },
        {
          title: "Workflow section for the framework README",
          lang: "markdown",
          code: `
## How we work
- main is protected: PR + 1 approval, always green on -Denv=local
- Branches: feature/<area>-<what>, fix/<what>, chore/<what>; delete after merge
- Before review: rebase on origin/main, run mvn test -Denv=local, fill in the PR template
- Owners: auth + accounts (A), transfers + e-Transfers (B), bills + DB utils (C)
- Shared code (AuthClient, Config, DbChecks): change in its own PR, tell the team first`,
        },
        {
          title: "CODEOWNERS for shared framework code (.github/CODEOWNERS)",
          lang: "text",
          code: `
# Pattern                                      Owner(s) (GitHub user names)
/src/test/java/com/icebank/support/auth/       @owner-of-auth
/src/test/java/com/icebank/support/db/         @owner-of-db-utils
/src/test/resources/config/                    @owner-of-auth @owner-of-db-utils
/pom.xml                                       @owner-of-auth @owner-of-etransfers @owner-of-db-utils`,
          note: "Replace the placeholders with your real GitHub user names. The last matching line wins, so put general patterns first and specific ones later.",
        },
        {
          title: "Red main: revert the merged PR on a branch",
          lang: "bash",
          code: `
git switch main && git pull
git log --oneline -5
# ea56791 Merge pull request #7 from team/feature/x    <- the culprit
git switch -c fix/revert-pr-7
git revert --no-edit -m 1 ea56791      # merge commit: -m 1 keeps main's side
# (for a squash-merged PR: git revert --no-edit <squash-id>)
mvn -q test -Denv=local
git push -u origin fix/revert-pr-7     # open a PR, get a quick approval, merge`,
          note: "Without <code>-m 1</code>, Git refuses: \"commit ea56791 is a merge but no -m option was given\".",
        },
        {
          title: "Stand-up line that prevents conflicts",
          lang: "text",
          code: `
A: "Today: chore/tag-suites touches every test class (adds @Tag). I will merge it before lunch.
    Rebase your branches after that; it is a one-line conflict per file."
B: "I am in ETransferLimitTest.java all day; I will rebase right after your merge."
C: "No shared files today. Reviewing B's PR at 14:00."`,
        },
      ],
      exercises: [
        "Write the \"How we work\" section of your framework README together and merge it through a PR that all three of you review.",
        "Split the week 1 exercise list (health check, login with OTP, accounts, transactions, specifications) between the three of you by area, as GitHub issues with owners.",
        "Run one full day with the workflow: everyone merges at least one PR reviewed by someone else, and <code>main</code> is green against Ice Bank local at the end of the day.",
        "Hold a 15-minute retro: what slowed you down (conflicts, waiting for reviews, broken main)? Write one rule change into the README.",
        "Run the three-person conflict drill: A and B both change the same test method in one test class on separate branches; A's PR is merged first; B rebases and resolves the conflict with the nine steps from lesson 6; C reviews B's PR with the review checklist. Each person writes down the commands they ran and what <code>git status</code> said at the conflict.",
      ],
      quiz: [
        {
          q: "Main is red against Ice Bank local right after a PR merge, and the cause is not obvious. What should the team do first?",
          options: [
            "Keep merging; the next PR might fix it",
            "Revert the offending PR (a revert PR or <code>git revert</code>), get main green, then fix forward on a branch",
            "Force-push main to the commit before the merge",
            "Disable the failing tests",
          ],
          answer: 1,
          explain: "Revert keeps history honest and unblocks everyone in minutes. Force-pushing main breaks every clone; disabling tests hides the problem.",
        },
        {
          q: "Main is green on local but 9 tests fail on QA. Is main \"broken\"?",
          options: [
            "Yes: block all merges until QA is green",
            "Not necessarily: QA has bugs planted on purpose; each QA failure should be explained or reported as a bug",
            "Yes, because QA is the real environment",
            "No, QA results never matter",
          ],
          answer: 1,
          explain: "Local (clean build) is the green bar for the framework. QA failures are often the point: they are bugs your tests found.",
        },
        {
          q: "What does a <code>CODEOWNERS</code> file add on top of branch protection?",
          options: [
            "It encrypts the listed files",
            "GitHub requests (and, if the rule requires it, needs) a review from the owner of the files a PR touches",
            "It stops other people from cloning the repo",
            "It runs the owner's tests automatically",
          ],
          answer: 1,
          explain: "Owners see every change to shared code such as <code>AuthClient</code> or the config loader.",
        },
        {
          q: "A is about to add <code>@Tag</code> to every test class. What reduces the pain for B and C most?",
          options: [
            "Do it quietly so nobody worries",
            "Announce it in stand-up, merge it quickly in its own PR, and have others rebase right after",
            "Do it on main directly to save time",
            "Split it into 30 PRs merged over a week",
          ],
          answer: 1,
          explain: "Cross-cutting changes conflict with everything. Small, announced, fast to merge, and everyone rebases once.",
        },
      ],
    },
  ],
});
