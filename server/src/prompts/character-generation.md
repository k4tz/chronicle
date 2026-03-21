# Character Generation

Generate a detailed character from a role description.

## Character Role
{{role}}

## Archetype (optional)
{{archetype}}

## Key Traits (optional)
{{traits}}

## Story Context
{{context}}

## Task
Create a compelling, three-dimensional character that fits the role and story context.

Include:
- A memorable name (and aliases if appropriate)
- Distinctive appearance
- Rich background that explains their motivations
- Clear personality traits
- Strong motivations and goals
- Meaningful fears and flaws
- Relevant abilities or skills
- Any secrets that add depth
- Unique speech patterns if applicable

## Output Format
Return ONLY valid JSON:
```json
{
  "name": "Full Name",
  "aliases": "aka, nicknames",
  "appearance": "Physical description",
  "background": "History and backstory",
  "personality": "Character traits and demeanor",
  "motivation": "What drives them",
  "fears": "What they're afraid of",
  "secrets": "Hidden information",
  "abilities": "Skills and capabilities",
  "flaws": "Character flaws and weaknesses",
  "speechPatterns": "Unique way of speaking"
}
```
