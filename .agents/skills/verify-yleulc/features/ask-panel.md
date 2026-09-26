# Ask an answer

Ask lets a user type a question, stream an answer from the selected provider, read it as bullets, and copy or extend it. It also shows a plain empty state before the first question and a retry card when the provider fails.

## Sub-features

- `ask-empty` shows the empty state text and the quick action chips before any question.
- `ask-send` streams an answer for a typed question.
- `ask-render` renders the question bubble and the answer bullets in the scroll region.
- `ask-actions` exposes Tell Me More and Copy under the answer.
- `ask-error` shows the failure card and a Retry button when the provider errors.
- `ask-latency` reports first-token and settle times as numbers.

## How to get to it (user POV)

- Type in the `Ask anything about this meeting` input and press Enter.
- Choose a quick action chip such as `What should I say next`.
- Press `Ctrl+Enter` to submit.
- Navigate to `Ask` in the header when another panel is open.

## Driving it with drive.mjs

Preconditions:

- `up.sh` completed and `env.sh` is sourced.
- `MOCK_SCENARIO=default` for `ask-send`, `ask-render`, and `ask-actions`.
- `MOCK_SCENARIO=error` for `ask-error`, then restart the run.

- **Empty state.** Read the whole UI. Run `node $SKILL_DIR/scripts/drive.mjs text`. The text contains `Ask for the next answer, a recap, or help with what is on screen.` and the chips `What should I say next`, `Follow up questions`, `Who am I talking to`, `Fact check`, `Recap`.
- **Capture the empty state.** Run `node $SKILL_DIR/scripts/drive.mjs shot $RUN_DIR/artifacts/ask/empty.png`. Read the PNG with your vision and confirm the composer, quick action strip, and pinned Get Answer and Submit row are visible and unclipped.
- **Send a question.** Run `node $SKILL_DIR/scripts/drive.mjs ask "hi"`. The JSON has `status: "done"`, `answer` equal to `Hi! How can I help?`, and `answerRendered: true`.
- **Confirm the answer is on screen.** Run `node $SKILL_DIR/scripts/drive.mjs text`. The text contains `hi` and `Hi! How can I help?` and shows `Tell Me More` and `Copy`.
- **Prove the answer is inside the visible region.** Run `node $SKILL_DIR/scripts/drive.mjs visible "Hi! How can I help?"`. It prints `visible`. `clipped` means the answer is in the DOM but scrolled out of the region, which is a defect: the ask region must pin the answer card to the top when a question is submitted.
- **Prove no control is cut off.** Run `node $SKILL_DIR/scripts/drive.mjs clipped`. It prints `none`. A list names the controls that overflow the 420px viewport without a scrollable ancestor. Controls inside the horizontally scrollable chip strip are excluded by design.
- **Capture the answer.** Run `node $SKILL_DIR/scripts/drive.mjs shot $RUN_DIR/artifacts/ask/answered.png`. Read the PNG with your vision and confirm the answer text is readable, the question bubble sits above it, and Get Answer and Submit are both fully inside the frame.
- **Record the timings.** Keep the `ask` JSON `firstTokenMs` and `settledMs` from the same command. Report them as numbers.
- **Prove the provider was called.** Run `curl -s http://127.0.0.1:$MOCK_PORT/requests`. The log contains a `POST /chat/completions` whose body model is `deepseek-flash`.
- **Failure path.** With `MOCK_SCENARIO=error`, run `node $SKILL_DIR/scripts/drive.mjs ask "hi"`. The JSON has `status: "error"` and `errorShown: true`, and the UI shows `Answer failed` with a `Retry` button.
- **Latency path.** With `MOCK_SCENARIO=slow`, run `node $SKILL_DIR/scripts/drive.mjs perf "hi"`. `status` is `done` and `settledMs` is greater than `firstTokenMs`, proving tokens arrived over time.

## Gotchas

- `drive.mjs ask` types into the real input. Do not also call `askQuestion` from `eval`; that bypasses the UI path and proves only the IPC layer.
- The answer scrolls inside `[data-scroll-region="ask"]`. The region pins the answer card to its top when a question arrives and scrolls to the newest segment while listening. Assert both the DOM text and `visible`; a text-only pass hides the clipping defect.
- The composer is one row: Smart Mode, the input, the Tab hint, Get Answer, and Submit. Any change that widens a control there can push Submit past the frame; run `clipped`.
- The `usage` event is emitted after `done`. `ask` resolves on `done`, so a missing usage event in the JSON is expected.
- The status pill is part of every screenshot. Read its wording so a listen regression is not mistaken for an Ask regression.
- A provider error from the mock is the intended `ask-error` proof, not a broken run.
