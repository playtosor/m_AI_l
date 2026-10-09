# Skills

Implémentations de skills m_AI_l pour harnais agents : `messaging/mailbox_read.md`
et `messaging/mailbox_write.md`.

| Skill | Rôle |
|---|---|
| `messaging/` | Messagerie complète. **Chemin principal** si le harnais supporte MCP (`packages/mcp`), **fallback** sinon. Coûte plus de tokens par message. |

## Chemin principal vs fallback

- **MCP supporté** → utiliser `@m_ai_l/mcp` (5 outils publics : `read_mail`, `write_mail`, `edit_mail`, `cancel_mail`, `archive_mail`).
- **MCP non supporté** → utiliser les skills `messaging/` (coût token plus élevé, surface plus large).

## Ajout de skills

Les futurs skills de support outillage rejoindront ce dossier au même niveau que `messaging/` (même nature SKILL.md).
