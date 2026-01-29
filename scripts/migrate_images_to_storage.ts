import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

// Load .env file
dotenv.config()

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function migrateProductImages() {
  console.log('🚀 Starting base64 → Storage migration...\n')
  
  // 1. Fetch all products with base64 images (where image_url is still null)
  const { data: products, error } = await supabase
    .from('products')
    .select('id, name, image, image_url, tenant_id')
    .not('image', 'is', null)
    .like('image', 'data:image/%')
    .is('image_url', null) // Only migrate if image_url not already set
  
  if (error) {
    console.error('❌ Failed to fetch products:', error)
    throw error
  }
  
  console.log(`📦 Found ${products.length} products needing migration\n`)
  
  if (products.length === 0) {
    console.log('✅ No products to migrate!')
    return { success: 0, failed: 0, skipped: 0, errors: [] }
  }
  
  const results = {
    success: 0,
    failed: 0,
    skipped: 0,
    errors: [] as any[]
  }
  
  // 2. Process each product
  for (let i = 0; i < products.length; i++) {
    const product = products[i]
    const progress = `[${i + 1}/${products.length}]`
    
    try {
      // Skip if already has image_url (safety check)
      if (product.image_url) {
        console.log(`${progress} ⏭️  Skipped: ${product.name} (already has URL)`)
        results.skipped++
        continue
      }
      
      // Extract base64 data and mime type
      const matches = product.image.match(/^data:(image\/\w+);base64,(.+)$/)
      if (!matches) {
        throw new Error(`Invalid base64 format`)
      }
      
      const mimeType = matches[1]
      const base64Data = matches[2]
      const extension = mimeType.split('/')[1]
      
      // Convert base64 to buffer
      const buffer = Buffer.from(base64Data, 'base64')
      const sizeKB = Math.round(buffer.length / 1024)
      
      // Generate unique filename: tenant_id/product_id.ext
      const filename = `${product.tenant_id}/${product.id}.${extension}`
      
      // Upload to Storage (using service role bypasses RLS)
      const { error: uploadError } = await supabase.storage
        .from('product-images')
        .upload(filename, buffer, {
          contentType: mimeType,
          upsert: true, // Overwrite if exists (idempotent)
          cacheControl: '31536000' // 1 year cache
        })
      
      if (uploadError) throw uploadError
      
      // Get public URL
      const { data: urlData } = supabase.storage
        .from('product-images')
        .getPublicUrl(filename)
      
      const publicUrl = urlData.publicUrl
      
      // Update product record: ONLY set image_url (preserve image for rollback)
      const { error: updateError } = await supabase
        .from('products')
        .update({ image_url: publicUrl })
        .eq('id', product.id)
      
      if (updateError) throw updateError
      
      results.success++
      console.log(`${progress} ✅ ${product.name} (${sizeKB}KB)`)
      console.log(`           → ${publicUrl}\n`)
      
    } catch (err: any) {
      results.failed++
      results.errors.push({
        productId: product.id,
        productName: product.name,
        error: err.message
      })
      console.error(`${progress} ❌ ${product.name}: ${err.message}\n`)
    }
  }
  
  // 3. Summary
  console.log('\n' + '='.repeat(60))
  console.log('📊 Migration Summary:')
  console.log(`   ✅ Success: ${results.success}`)
  console.log(`   ⏭️  Skipped: ${results.skipped}`)
  console.log(`   ❌ Failed: ${results.failed}`)
  console.log('='.repeat(60) + '\n')
  
  if (results.errors.length > 0) {
    console.log('❌ Errors:')
    results.errors.forEach(e => {
      console.log(`   - ${e.productName} (${e.productId}): ${e.error}`)
    })
    console.log()
  }
  
  if (results.success > 0) {
    console.log('📋 Next steps:')
    console.log('   1. Deploy Edge Function changes (use image_url)')
    console.log('   2. Deploy frontend changes (image_url || image fallback)')
    console.log('   3. Test storefront displays images correctly')
    console.log('   4. Verify performance improvement (<500ms)')
    console.log('   5. After 24-48h verification, run cleanup script\n')
  }
  
  return results
}

// Run migration
migrateProductImages()
  .then(results => {
    if (results.failed === 0) {
      console.log('🎉 Migration completed successfully!\n')
      process.exit(0)
    } else {
      console.log('⚠️  Migration completed with errors')
      console.log('   Review errors above and re-run script\n')
      process.exit(1)
    }
  })
  .catch(err => {
    console.error('💥 Fatal error:', err)
    process.exit(1)
  })
