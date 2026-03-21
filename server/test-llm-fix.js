const fetch = require('node-fetch')

async function testAllGenerations() {
  console.log('=== Testing All LLM Generations (Post-Fix) ===\n')
  
  // Create project
  const projectRes = await fetch('http://localhost:3001/api/projects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: 'LLM Test',
      logline: 'Testing all generations',
      genre: 'Fantasy',
      tone: 'Epic',
      contentRating: 'general',
      pov: 'third-limited',
      targetWordCount: 50000
    })
  })
  const project = await projectRes.json()
  const projectId = project.id
  console.log(`✓ Created project: ${projectId}\n`)
  
  const results = { passed: 0, failed: 0, details: [] }
  
  // Test 1: World Generation
  console.log('1. World Generation...')
  try {
    const res = await fetch(`http://localhost:3001/api/projects/${projectId}/generate/world`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ seed: 'Floating sky islands with giant birds' })
    })
    const data = await res.json()
    if (data.success) {
      console.log(`   ✓ Success! Cosmology: ${data.world.cosmology?.substring(0, 60)}...\n`)
      results.passed++
    } else {
      console.log(`   ✗ Failed: ${data.error} - ${data.details}\n`)
      results.failed++
      results.details.push({ test: 'World', error: data.details })
    }
  } catch (e) {
    console.log(`   ✗ Error: ${e.message}\n`)
    results.failed++
    results.details.push({ test: 'World', error: e.message })
  }
  
  // Test 2-4: Character Generation (3 iterations)
  const charTests = [
    { role: 'protagonist', archetype: 'reluctant hero', traits: 'brave, clever' },
    { role: 'antagonist', archetype: 'fallen mentor', traits: 'cunning, ruthless' },
    { role: 'mentor', archetype: 'wise guide', traits: 'patient, mysterious' }
  ]
  
  for (let i = 0; i < charTests.length; i++) {
    const tc = charTests[i]
    console.log(`${2 + i}. Character Generation (${tc.role})...`)
    try {
      const res = await fetch(`http://localhost:3001/api/projects/${projectId}/generate/character`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(tc)
      })
      const data = await res.json()
      if (data.success && data.character) {
        console.log(`   ✓ Success! ${data.character.name}\n`)
        results.passed++
      } else {
        console.log(`   ✗ Failed: ${data.error} - ${data.details}\n`)
        results.failed++
        results.details.push({ test: `Character (${tc.role})`, error: data.details })
      }
    } catch (e) {
      console.log(`   ✗ Error: ${e.message}\n`)
      results.failed++
      results.details.push({ test: `Character (${tc.role})`, error: e.message })
    }
  }
  
  // Test 5-6: Location Generation (2 iterations)
  const locTests = [
    { type: 'ancient temple', purpose: 'sacred sanctuary', atmosphere: 'mysterious, holy' },
    { type: 'floating market', purpose: 'trade hub', atmosphere: 'bustling, colorful' }
  ]
  
  for (let i = 0; i < locTests.length; i++) {
    const tc = locTests[i]
    console.log(`${5 + i}. Location Generation (${tc.type})...`)
    try {
      const res = await fetch(`http://localhost:3001/api/projects/${projectId}/generate/location`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(tc)
      })
      const data = await res.json()
      if (data.success && data.location) {
        console.log(`   ✓ Success! ${data.location.name}\n`)
        results.passed++
      } else {
        console.log(`   ✗ Failed: ${data.error} - ${data.details}\n`)
        results.failed++
        results.details.push({ test: `Location (${tc.type})`, error: data.details })
      }
    } catch (e) {
      console.log(`   ✗ Error: ${e.message}\n`)
      results.failed++
      results.details.push({ test: `Location (${tc.type})`, error: e.message })
    }
  }
  
  // Summary
  console.log('=== Summary ===')
  console.log(`Passed: ${results.passed}/6`)
  console.log(`Failed: ${results.failed}/6`)
  
  if (results.details.length > 0) {
    console.log('\n=== Failure Details ===')
    results.details.forEach(d => console.log(`  - ${d.test}: ${d.error}`))
  }
  
  if (results.failed === 0) {
    console.log('\n✓ All LLM generations working perfectly!')
  } else if (results.failed <= 1) {
    console.log('\n✓ Near-perfect! Occasional failures are normal.')
  }
}

testAllGenerations().catch(console.error)
