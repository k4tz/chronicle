# Entity Extraction

Extract story entities and state changes from the chapter.

## Chapter Content
{{chapter}}

## Current Story State
{{currentState}}

## Task
Identify:
1. **Character States** - Where each character is, their condition, goals, new knowledge
2. **Location States** - Who's there, current condition, active events
3. **New Canon Facts** - Information that is now true in the story world
4. **World Changes** - Any changes to the setting, politics, relationships, etc.
5. **Plot Thread Updates** - Which threads advanced, were resolved, or opened

## Output Format
Return ONLY valid JSON:
```json
{
  "characterStates": [
    {
      "charId": "character_id_or_name",
      "location": "current location",
      "condition": "normal|injured|exhausted|etc",
      "emotionalState": "current emotion",
      "activeGoals": ["goal1", "goal2"],
      "newKnowledge": ["fact1", "fact2"]
    }
  ],
  "locationStates": [
    {
      "locationId": "location_id_or_name",
      "currentOccupants": ["character1", "character2"],
      "condition": "current state",
      "activeEvents": ["event1", "event2"]
    }
  ],
  "newCanonFacts": ["New fact established in this chapter"],
  "worldChanges": ["Change to the world state"],
  "plotThreadUpdates": [
    {
      "threadId": "thread_id_or_name",
      "status": "planted|active|resolved|dropped",
      "development": "What happened with this thread"
    }
  ]
}
```
