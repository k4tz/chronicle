# Style Extraction

Analyze the writing samples and extract a detailed style profile.

## Writing Samples
{{samples}}

## Task
Analyze the provided writing samples and extract the author's style characteristics.

## Output Format
Return ONLY valid JSON:
```json
{
  "sentenceLengthTendency": "short|medium|long|varied",
  "metaphorDensity": "sparse|moderate|rich",
  "vocabularyRegister": "simple|literary|archaic|contemporary",
  "pacingRhythm": "slow-burn|moderate|fast-paced",
  "dialogueToNarrationRatio": 0.0,
  "descriptionDensity": "minimal|moderate|immersive",
  "povIntimacy": "distant|close|deep",
  "internalMonologue": "none|occasional|frequent",
  "voiceProfileStub": null,
  "notes": "Brief observations about this writing style"
}
```

Analyze:
- Average sentence length and variation
- Frequency and type of figurative language
- Word choice complexity and register
- Scene pacing and rhythm patterns
- Ratio of dialogue to narration
- Amount of descriptive detail
- How close the POV is to character thoughts
- Frequency of internal monologue
