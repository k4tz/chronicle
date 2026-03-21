const fetch = require('node-fetch')

async function debugFailures() {
  console.log('=== Debugging LLM Response Failures ===\n')
  
  // Create project
  const projectRes = await fetch('http://localhost:3001/api/projects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: 'Debug Test',
      logline: 'test',
      genre: 'Fantasy',
      tone: 'Epic',
      contentRating: 'general',
      pov: 'third-limited',
      targetWordCount: 50000
    })
  })
  const project = await projectRes.json()
  const projectId = project.id
  
  // Test 5 character generations rapidly
  console.log('Testing 5 rapid character generations...\n')
  
  for (let i = 1; i <= 5; i++) {
    console.log(`${i}. Generating character...`)
    try {
      const res = await fetch(`http://localhost:3001/api/projects/${projectId}/generate/character`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'warrior', archetype: 'veteran', traits: 'strong, loyal' })
      })
      const data = await res.json()
      
      if (data.success) {
        console.log(`   ✓ Success: ${data.character.name}`)
      } else {
        console.log(`   ✗ Failed: ${data.error}`)
        console.log(`   Details: ${data.details}`)
      }
    } catch (e) {
      console.log(`   ✗ Error: ${e.message}`)
    }
  }
  
  console.log('\n\n=== Testing Direct LLM Connection ===\n')
  
  // Test direct llama.cpp connection
  const directRes = await fetch('http://localhost:8080/completion', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt: 'Output JSON: {"test": "value"}',
      n_predict: 100,
      temperature: 0.8
    })
  })
  
  const directData = await directRes.json()
  console.log('Direct LLM response:')
  console.log('  Content length:', directData.content?.length || 0)
  console.log('  Content preview:', directData.content?.substring(0, 200))
  console.log('  Stop reason:', directData.stop)
}

debugFailures().catch(console.error)
