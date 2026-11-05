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
</ul>`,
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
      ],
      exercises: [
        "Run <code>git log --oneline --graph --decorate -15</code> inside your local Ice Bank clone. Identify <code>HEAD</code>, <code>main</code> and <code>origin/main</code> in the output and explain in one sentence each what they point to.",
        "Change a file in your framework repo without staging it, stage a second file, and create a third new file. Run <code>git status</code> and say which of the four places each change is in.",
        "Draw (on paper or in your notes) the commit graph after: two commits on <code>main</code>, a branch with two commits, and one more commit on <code>main</code>. Mark where each branch label and <code>HEAD</code> point.",
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
</ul>`,
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
      ],
      exercises: [
        "Configure <code>user.name</code>, <code>user.email</code>, <code>core.autocrlf</code> and <code>pull.rebase</code>, then show them with <code>git config --global --list</code>.",
        "Clone your team's framework repo (or create it if you are the first). Add a REST Assured test that calls <code>GET /api/v1/test/health</code> on Ice Bank local and asserts <code>status</code> is <code>UP</code>. Commit it as one focused commit.",
        "Make a change with two unrelated edits in the same file. Use <code>git add -p</code> to commit them as two separate commits. Show the result with <code>git log -p -2</code>.",
        "Commit something with a typo in the message, then fix it with <code>git commit --amend</code>. Explain why you must not do this after pushing.",
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
is not merged, which protects you; <code>-D</code> forces.</p>`,
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
      ],
      exercises: [
        "Agree with your teammates on a branch naming convention and write it into the framework README.",
        "Create <code>feature/accounts-api-tests</code> from an up-to-date <code>main</code>, add a test for <code>GET /api/v1/accounts</code> as Emma (four accounts, ids 1 to 4), and commit. Show <code>git log --oneline main..HEAD</code>.",
        "While you have uncommitted changes, stash them, check out a teammate's branch, run their tests against Ice Bank local, come back and pop the stash.",
        "After your branch is merged (lesson 5), delete it locally and remotely and run <code>git fetch --prune</code>.",
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
<code>npm run dev</code>. Do not edit the Ice Bank repo; local changes there make every <code>git pull</code> a conflict.</p>`,
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
      ],
      exercises: [
        "Push your branch from lesson 3 with <code>-u</code>, then make one more commit and push it with a plain <code>git push</code>. Find both commits on GitHub.",
        "With a teammate: both commit to the same feature branch, one pushes first. The second one's push is rejected; resolve it with <code>git pull</code> (rebase) and push. Write down the exact messages you saw.",
        "After a teammate merges something into <code>main</code>, update your feature branch with <code>git rebase origin/main</code>, run the tests against Ice Bank local, and push with <code>--force-with-lease</code>.",
        "Run <code>git fetch</code> then <code>git status</code> in your Ice Bank clone and report whether you are behind. If you are, pull and restart the app following the steps above.",
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
clean commit on main) or <strong>Rebase and merge</strong> if the individual commits are meaningful. Delete the branch afterwards.</p>`,
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
      ],
      exercises: [
        "Turn on branch protection for <code>main</code> in your framework repo: pull request required, one approval required.",
        "Open a pull request for your accounts tests branch using the template, with a clear title and the exact command to run the tests against Ice Bank local.",
        "Review a teammate's PR: check it out, run it against Ice Bank local, and leave at least two specific comments (one can be praise). Approve or request changes.",
        "Address review comments on your own PR with new commits, reply to each comment, then merge with Squash and merge and delete the branch.",
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
</ul>`,
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
      ],
      exercises: [
        "Create a conflict on purpose with a teammate: both change the same line of <code>local.properties</code> on different branches; merge one PR, then rebase the other. Resolve it by hand with the markers.",
        "Create a second conflict in a Java test class and resolve it with IntelliJ's three-pane tool. Run the affected tests against Ice Bank local before you continue the rebase.",
        "Start a rebase that conflicts and use <code>git rebase --abort</code>. Confirm with <code>git log</code> and <code>git status</code> that nothing changed.",
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
in the README how to create it (Tutorial 6, lesson 3).</p>`,
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
      ],
      exercises: [
        "Add the <code>.gitignore</code> above to your framework repo, run <code>mvn test -Denv=local</code> and an Allure report, and confirm <code>git status</code> shows nothing from <code>target/</code> or <code>allure-results/</code>.",
        "Create <code>config/qa.example.properties</code> with placeholders and an ignored <code>config/qa.properties</code> with your real QA values. Prove with <code>git check-ignore -v</code> that the real file is ignored.",
        "Search your repository's history for anything that looks like a QA sandbox key, a token (<code>eyJ</code>) or a Supabase connection string. Report what you find to your team (and the instructor if it is a QA secret).",
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
</tbody></table></div>`,
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
      ],
      exercises: [
        "Rewrite these messages properly: \"fix\", \"tests\", \"updated config for qa\", \"Changed the login\". Invent plausible details from Ice Bank.",
        "Agree with your team on a message convention (with or without prefixes) and write three examples of it in the framework README.",
        "Run <code>git log --oneline -20</code> on your framework repo and pick the two weakest messages. Write what they should have said in your notes (do not rewrite pushed history).",
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
<p>Use GitHub Issues (or your Jira board, Tutorial 5) for tasks and bugs; link PRs with "Closes #12" in the description so merging closes the issue.</p>`,
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
      ],
      exercises: [
        "Write the \"How we work\" section of your framework README together and merge it through a PR that all three of you review.",
        "Split the week 1 exercise list (health check, login with OTP, accounts, transactions, specifications) between the three of you by area, as GitHub issues with owners.",
        "Run one full day with the workflow: everyone merges at least one PR reviewed by someone else, and <code>main</code> is green against Ice Bank local at the end of the day.",
        "Hold a 15-minute retro: what slowed you down (conflicts, waiting for reviews, broken main)? Write one rule change into the README.",
      ],
    },
  ],
});
