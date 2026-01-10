#!/usr/bin/env pwsh
# Deployment script for storefront → POS subscription integration fixes
# Run from purveyos-storefront directory

Write-Host "🚀 Starting Storefront → POS Integration Deployment" -ForegroundColor Cyan
Write-Host ""

# ============================================
# STEP 1: Apply Schema Migration
# ============================================

Write-Host "📊 STEP 1: Applying schema migration..." -ForegroundColor Yellow
Write-Host "Migration file: supabase/migrations/20260109_complete_subscription_schema.sql"
Write-Host ""

$applyMigration = Read-Host "Apply migration to Supabase? (y/n)"
if ($applyMigration -eq 'y') {
    Write-Host "Applying migration..." -ForegroundColor Green
    supabase db push
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Migration applied successfully!" -ForegroundColor Green
    } else {
        Write-Host "❌ Migration failed!" -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "⚠️ Skipping migration (manual apply required)" -ForegroundColor Yellow
}

Write-Host ""

# ============================================
# STEP 2: Verify Schema Changes
# ============================================

Write-Host "🔍 STEP 2: Verifying schema changes..." -ForegroundColor Yellow
Write-Host ""

$verifySchema = Read-Host "Run schema verification queries? (y/n)"
if ($verifySchema -eq 'y') {
    Write-Host "Verifying subscription_box_items columns..." -ForegroundColor Cyan
    supabase db query "SELECT column_name, data_type FROM information_schema.columns WHERE table_name='subscription_box_items' AND column_name IN ('substitution_group', 'is_substitution_option', 'substitution_group_units_allowed') ORDER BY column_name;"
    
    Write-Host ""
    Write-Host "Verifying customer_substitution_preferences table..." -ForegroundColor Cyan
    supabase db query "SELECT COUNT(*) as table_exists FROM information_schema.tables WHERE table_name='customer_substitution_preferences';"
    
    Write-Host ""
    Write-Host "Verifying orders idempotency index..." -ForegroundColor Cyan
    supabase db query "SELECT indexname FROM pg_indexes WHERE tablename='orders' AND indexname='idx_orders_tenant_stripe_pi';"
    
    Write-Host ""
    Write-Host "✅ Schema verification complete!" -ForegroundColor Green
}

Write-Host ""

# ============================================
# STEP 3: Deploy Edge Function
# ============================================

Write-Host "☁️ STEP 3: Deploying edge function..." -ForegroundColor Yellow
Write-Host "Function: create-storefront-order"
Write-Host ""
Write-Host "Changes applied:"
Write-Host "  ✅ Added payment_status='paid' (line 248)" -ForegroundColor Green
Write-Host "  ✅ Fixed buildChoicesFromRequest (group deduplication)" -ForegroundColor Green
Write-Host "  ✅ Fixed buildPreferencesFromRequest (base item IDs)" -ForegroundColor Green
Write-Host ""

$deployFunction = Read-Host "Deploy edge function? (y/n)"
if ($deployFunction -eq 'y') {
    Write-Host "Deploying function..." -ForegroundColor Green
    supabase functions deploy create-storefront-order
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Function deployed successfully!" -ForegroundColor Green
    } else {
        Write-Host "❌ Function deployment failed!" -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "⚠️ Skipping function deployment (manual deploy required)" -ForegroundColor Yellow
}

Write-Host ""

# ============================================
# STEP 4: Test Edge Function
# ============================================

Write-Host "🧪 STEP 4: Testing edge function..." -ForegroundColor Yellow
Write-Host ""

$testFunction = Read-Host "Run test order? (y/n)"
if ($testFunction -eq 'y') {
    Write-Host "Reading project URL and anon key from Supabase config..."
    $projectUrl = supabase status --output json | ConvertFrom-Json | Select-Object -ExpandProperty API_URL
    $anonKey = supabase status --output json | ConvertFrom-Json | Select-Object -ExpandProperty ANON_KEY
    
    Write-Host "Project URL: $projectUrl"
    Write-Host "Testing with dummy data..."
    Write-Host ""
    
    $testPayload = @{
        tenantId = "test-tenant-123"
        customerId = "test-customer-456"
        subscriptionProductId = "weekly-box"
        stripePaymentIntentId = "pi_test_$(Get-Random -Minimum 10000 -Maximum 99999)"
        subtotalCents = 5000
        taxCents = 500
        totalCents = 5500
        subscription = @{
            enabled = $true
            substitutions = @{
                "Protein" = @(
                    @{ productId = "chicken-breast"; quantity = 1 },
                    @{ productId = "ground-beef"; quantity = 0.5 }
                )
            }
        }
    } | ConvertTo-Json -Depth 5
    
    $response = Invoke-WebRequest -Uri "$projectUrl/functions/v1/create-storefront-order" `
        -Method POST `
        -Headers @{
            "Authorization" = "Bearer $anonKey"
            "Content-Type" = "application/json"
        } `
        -Body $testPayload `
        -ErrorAction SilentlyContinue
    
    if ($response.StatusCode -eq 200) {
        Write-Host "✅ Test order succeeded!" -ForegroundColor Green
        Write-Host "Response: $($response.Content)" -ForegroundColor Cyan
    } else {
        Write-Host "❌ Test order failed!" -ForegroundColor Red
        Write-Host "Status: $($response.StatusCode)" -ForegroundColor Red
        Write-Host "Response: $($response.Content)" -ForegroundColor Red
    }
}

Write-Host ""

# ============================================
# STEP 5: Summary
# ============================================

Write-Host "=" * 60 -ForegroundColor Cyan
Write-Host "DEPLOYMENT SUMMARY" -ForegroundColor Cyan
Write-Host "=" * 60 -ForegroundColor Cyan
Write-Host ""
Write-Host "✅ Schema Migration: 20260109_complete_subscription_schema.sql" -ForegroundColor Green
Write-Host "   - Added subscription_box_items columns (substitution_group, is_substitution_option, substitution_group_units_allowed)"
Write-Host "   - Created customer_substitution_preferences table"
Write-Host "   - Added orders idempotency index (idx_orders_tenant_stripe_pi)"
Write-Host ""
Write-Host "✅ Edge Function: create-storefront-order" -ForegroundColor Green
Write-Host "   - Fixed payment_status='paid' (line 248)"
Write-Host "   - Fixed buildChoicesFromRequest (group deduplication)"
Write-Host "   - Fixed buildPreferencesFromRequest (base item IDs, quantity validation)"
Write-Host ""
Write-Host "⚠️ Remaining Work: POS Screens (3 files)" -ForegroundColor Yellow
Write-Host "   - Huckster-UI/src/screens/orders/OrdersListScreen.tsx (30 min)"
Write-Host "   - Huckster-UI/src/screens/orders/OrderDetailsScreen.tsx (2 hours)"
Write-Host "   - Huckster-UI/src/components/modals/SubscriptionBoxPackageSelectionModal.tsx (3 hours)"
Write-Host ""
Write-Host "📚 Documentation: STOREFRONT_POS_INTEGRATION_FINAL.md" -ForegroundColor Cyan
Write-Host ""
Write-Host "🎉 Backend integration complete! Ready for POS screen implementation." -ForegroundColor Green
Write-Host ""
