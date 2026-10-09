## Mailbox Operations (V2)

When the user types any of these triggers, call the `mailbox` tool immediately:

| Trigger | Call |
|---|---|
| `MAIL!` | `mailbox({ action: "mail", project_handle: "PROJET", handle: "HANDLE" })` |
| `MAIL! no_archive` | `mailbox({ action: "mail", project_handle: "PROJET", handle: "HANDLE", no_archive: true })` — peek sans archiver |
| `MAIL! limit N` | `mailbox({ action: "mail", project_handle: "PROJET", handle: "HANDLE", limit: N })` — lire N messages max |
| `SEND! to X subj Y body Z` | `mailbox({ action: "send", project_handle: "PROJET", recipient: "X", subject: "Y", body: "Z" })` |
| `SEND! from S to X subj Y body Z` | `mailbox({ action: "send", project_handle: "PROJET", sender: "S", recipient: "X", subject: "Y", body: "Z" })` |
| `REGISTER role R` | `mailbox({ action: "register", project_handle: "PROJET", handle: "HANDLE", role: "R" })` |

Always explicitly provide `project_handle` — no implicit resolution. 
Never explain the tool's call, just execute it. 
After the return, provide a summary in a maximum of 5 words to the user.