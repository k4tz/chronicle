# Snapshot Assistant

Extract the story state changes from this chapter to maintain continuity across the novel.

## Chapter Information
- **Chapter:** {{chapterNumber}}
- **Title:** {{chapterTitle}}

## Previous Story State
- **World Changes So Far:** {{prevWorldChanges}}
- **Canon Facts So Far:** {{prevCanonFacts}}

## Characters in This Chapter
{{characters}}

## Locations in This Chapter
{{locations}}

## Chapter Content
{{content}}

## Task
Analyze the chapter and extract ALL story state changes. This is critical for maintaining continuity in a 400,000-word novel.

Identify:
1. **Character States**: For each character appearing in this chapter:
   - Where are they now (location)?
   - Physical condition (uninjured, injured, exhausted, empowered, etc.)?
   - Emotional state (hopeful, fearful, determined, etc.)?
   - What are their active goals?
   - What new knowledge did they gain?

2. **Location States**: For each location featured:
   - Who is currently there?
   - What is the condition of the location?
   - What events are happening there?

3. **Plot Threads**: Which story threads were advanced?
   - Thread name
   - Urgency level (1=background, 2=active, 3=urgent)
   - What development occurred?

4. **New Canon Facts**: What facts are now established truth in this world?
   - Character revelations
   - Historical discoveries
   - Magic system rules revealed
   - Relationship confirmations

5. **World Changes**: What changed in the world state?
   - Political shifts
   - Physical changes to locations
   - Deaths, births, marriages
   - Power transfers
   - Magical events with lasting impact

## Output Format
Return ONLY valid JSON with this exact structure:
```json
{
  "worldChanges": ["concise statement of each world change"],
  "newCanonFacts": ["concise statement of each new canon fact"],
  "characterStates": [
    {
      "characterName": "exact character name",
      "location": "current location name",
      "condition": "physical condition",
      "emotionalState": "current emotion",
      "activeGoals": ["goal 1", "goal 2"],
      "newKnowledge": ["fact learned"]
    }
  ],
  "locationStates": [
    {
      "locationName": "exact location name",
      "currentOccupants": ["character name"],
      "condition": "location state",
      "activeEvents": ["event happening"]
    }
  ],
  "openThreads": [
    {
      "name": "thread name",
      "urgency": 2,
      "lastDevelopment": "what happened in this chapter"
    }
  ]
}
```

Important: 
- Be specific and concrete. Avoid vague statements.
- Include EVERY change, no matter how small.
- If a character learned something important, it goes in newKnowledge.
- If the world is different after this chapter, it goes in worldChanges.
- Return ONLY the JSON, no explanation.
