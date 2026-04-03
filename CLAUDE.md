# CLAUDE.md

## 언어
- 모든 주석은 한국어로 작성한다.

## 코딩 스타일
- 변수명과 함수명은 camelCase를 사용한다. (예: `userName`, `fetchMailList`)
- 클래스명은 PascalCase를 사용한다.

## 프레임워크
- React 사용 금지.
- 프론트엔드는 순수 HTML / 바닐라 JavaScript만 사용한다.

## 디자인
- 항상 웹사이트 우선 반응형으로

## GitHub 자동 푸시
- GitHub와 연결된 웹앱 파일(index.html 등)을 수정할 때는 수정 완료 후 항상 아래 순서로 GitHub에 푸시한다:
  1. `git add <수정한 파일>`
  2. `git commit -m "feat/fix: <변경 내용 한 줄 요약>"`
  3. `git push origin main`
- 별도로 언급하지 않아도 파일 수정이 완료되면 자동으로 푸시까지 진행한다.

## Firebase 자동 배포
- Firebase와 연결된 프로젝트 파일을 수정할 때는 수정 완료 후 자동으로 배포한다:
  - `news_reader_web/` → `cd news_reader_web && firebase deploy`
  - `boardgame-strategy-firebase/` → `cd boardgame-strategy-firebase && firebase deploy`
- 별도로 언급하지 않아도 파일 수정이 완료되면 자동으로 deploy까지 진행한다.

## Token Efficiency Rules

### Core Principles
- No explanations unless explicitly requested
- No summaries after completing tasks
- No "I'll now...", "Let me...", "Done!" type commentary
- Skip confirmations for straightforward tasks — just execute
- Never repeat code that already exists in context

### Communication
- Responses: 1-2 sentences max for simple tasks
- Only mention what changed, not what stayed the same
- No preamble, no postamble
- If a task is clear, start doing it immediately without restating it

### Code Output
- Write only the code that needs to change
- Use `// ... existing code` to skip unchanged sections
- No duplicate function/class definitions already visible in context
- Omit boilerplate comments (e.g., "// This function does X")

### Tool Use
- Read only the files needed for the task
- Avoid re-reading files already in context
- Batch related edits into single tool calls where possible
- Prefer `str_replace` over full file rewrites

### Thinking
- Use extended thinking only when explicitly asked (`think`, `ultrathink`)
- Default to direct execution for routine tasks

### When to Be Verbose
- Explaining a non-obvious architectural decision
- Flagging a potential bug or risk
- Asked explicitly to explain or document
