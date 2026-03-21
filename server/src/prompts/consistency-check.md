# Continuity Check

Analyze the chapter for continuity errors and inconsistencies.

## Story Bible
{{context}}

## Chapter Content
{{chapter}}

## Task
Identify any contradictions or inconsistencies including:
1. **Character Contradictions** - Acting against established personality, abilities, or knowledge
2. **Location Errors** - Being in two places, impossible travel, wrong location details
3. **Timeline Issues** - Events out of order, impossible timeframes
4. **Plot Holes** - Logic gaps, unexplained elements, broken causality
5. **Fact Contradictions** - Contradicting established world facts

## Output Format
Return ONLY a JSON array:
```json
[
  {
    "type": "character|location|timeline|plot|fact",
    "severity": "low|medium|high",
    "issue": "Clear description of the problem",
    "suggestion": "How to fix it",
    "quote": "Relevant text from chapter"
  }
]
```

If no issues found, return: `[]`
