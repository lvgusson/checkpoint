# Append-only deprecation entry template

Append entries to the corresponding area/domain archive before replacing current facts. Use the exact previous complete logical block, preserving bytes and line endings. Existing entries must never change. Choose fences longer than any fence in the original block.

If provenance metadata contains an error, append a clearly labeled metadata correction after the original fenced content. State the corrected value and reason; preserve the original entry and exact historical content. Never silently rewrite an existing entry or archive the same previous version twice.

````markdown
## DEP-YYYYMMDD-unique-id

- Date: YYYY-MM-DDTHH:mm:ss±HH:mm
- Source: `original-document-path`
- Original document ID: `stable-id`
- Original section: `heading-or-document`
- Reason: Explain the replacement.
- Replacement: `new-document-or-section`
- Related code: `changed/source/path` or N/A for harness-only changes
- Change reference: task/commit/PR when available

### Exact previous content

```markdown
Complete exact original logical block or retired document.
```
````
