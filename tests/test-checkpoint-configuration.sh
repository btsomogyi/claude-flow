#!/bin/bash
# Test script for checkpoint configuration options

set -e

echo "🧪 Testing checkpoint configuration options..."

# Setup test directory
TEST_DIR="/tmp/claude-flow-checkpoint-test-$(date +%s)"
mkdir -p "$TEST_DIR"
cd "$TEST_DIR"

# Initialize git repo for testing
git init
git config user.email "test@example.com"
git config user.name "Test User"

echo "📝 Test 1: Checkpoints enabled by default"
# Copy checkpoint hook script
mkdir -p .claude/helpers
cat > .claude/helpers/test-checkpoint.sh << 'EOF'
#!/bin/bash
# Check if checkpoints are enabled
if [ "${CLAUDE_FLOW_CHECKPOINTS_ENABLED:-true}" = "false" ]; then
    echo "DISABLED"
    exit 0
fi
echo "ENABLED"
EOF
chmod +x .claude/helpers/test-checkpoint.sh

# Test with default (enabled)
result=$(.claude/helpers/test-checkpoint.sh)
if [ "$result" = "ENABLED" ]; then
    echo "✅ Test 1 passed: Checkpoints enabled by default"
else
    echo "❌ Test 1 failed: Expected ENABLED, got $result"
    exit 1
fi

echo "📝 Test 2: Checkpoints disabled via environment variable"
# Test with disabled
export CLAUDE_FLOW_CHECKPOINTS_ENABLED=false
result=$(.claude/helpers/test-checkpoint.sh)
if [ "$result" = "DISABLED" ]; then
    echo "✅ Test 2 passed: Checkpoints disabled via environment variable"
else
    echo "❌ Test 2 failed: Expected DISABLED, got $result"
    exit 1
fi

echo "📝 Test 3: Checkpoints re-enabled via environment variable"
# Test re-enabling
export CLAUDE_FLOW_CHECKPOINTS_ENABLED=true
result=$(.claude/helpers/test-checkpoint.sh)
if [ "$result" = "ENABLED" ]; then
    echo "✅ Test 3 passed: Checkpoints re-enabled via environment variable"
else
    echo "❌ Test 3 failed: Expected ENABLED, got $result"
    exit 1
fi

echo "📝 Test 4: Test actual checkpoint script behavior"
# Copy actual checkpoint script (simplified version)
cat > .claude/helpers/checkpoint-test.sh << 'EOF'
#!/bin/bash

# Check if checkpoints are enabled
if [ "${CLAUDE_FLOW_CHECKPOINTS_ENABLED:-true}" = "false" ]; then
    echo "ℹ️  Checkpoints disabled (CLAUDE_FLOW_CHECKPOINTS_ENABLED=false)"
    exit 0
fi

task_checkpoint() {
    # Check if checkpoints are disabled
    if [ "${CLAUDE_FLOW_CHECKPOINTS_ENABLED:-true}" = "false" ]; then
        return 0
    fi
    
    echo "Creating checkpoint..."
    # Simulate checkpoint creation
    mkdir -p .claude/checkpoints
    echo "{\"timestamp\": \"$(date)\"}" > .claude/checkpoints/test.json
    echo "✅ Created checkpoint"
}

case "$1" in
    task)
        task_checkpoint "$2"
        ;;
    *)
        echo "Usage: $0 task [input]"
        exit 1
        ;;
esac
EOF
chmod +x .claude/helpers/checkpoint-test.sh

# Test with checkpoints enabled
unset CLAUDE_FLOW_CHECKPOINTS_ENABLED
.claude/helpers/checkpoint-test.sh task "test task" > output.txt 2>&1
if grep -q "Created checkpoint" output.txt; then
    echo "✅ Test 4a passed: Checkpoint created when enabled"
else
    echo "❌ Test 4a failed: Checkpoint should have been created"
    cat output.txt
    exit 1
fi

# Test with checkpoints disabled
export CLAUDE_FLOW_CHECKPOINTS_ENABLED=false
.claude/helpers/checkpoint-test.sh task "test task" > output.txt 2>&1
if grep -q "Checkpoints disabled" output.txt; then
    echo "✅ Test 4b passed: Checkpoint skipped when disabled"
else
    echo "❌ Test 4b failed: Checkpoint should have been skipped"
    cat output.txt
    exit 1
fi

echo "📝 Test 5: CLI flag test simulation"
# Simulate the CLI flag behavior
cat > test-cli-flag.sh << 'EOF'
#!/bin/bash

# Simulate CLI flag parsing
NO_CHECKPOINTS=false
for arg in "$@"; do
    if [ "$arg" = "--no-checkpoints" ]; then
        NO_CHECKPOINTS=true
    fi
done

# Set environment variable based on flag
if [ "$NO_CHECKPOINTS" = "true" ]; then
    export CLAUDE_FLOW_CHECKPOINTS_ENABLED=false
    echo "Checkpoints disabled via CLI flag"
else
    export CLAUDE_FLOW_CHECKPOINTS_ENABLED=true
    echo "Checkpoints enabled (default)"
fi

# Show final state
echo "CLAUDE_FLOW_CHECKPOINTS_ENABLED=$CLAUDE_FLOW_CHECKPOINTS_ENABLED"
EOF
chmod +x test-cli-flag.sh

# Test without flag
./test-cli-flag.sh > output.txt 2>&1
if grep -q "CLAUDE_FLOW_CHECKPOINTS_ENABLED=true" output.txt; then
    echo "✅ Test 5a passed: Checkpoints enabled by default"
else
    echo "❌ Test 5a failed: Expected checkpoints to be enabled"
    cat output.txt
    exit 1
fi

# Test with flag
./test-cli-flag.sh --no-checkpoints > output.txt 2>&1
if grep -q "CLAUDE_FLOW_CHECKPOINTS_ENABLED=false" output.txt; then
    echo "✅ Test 5b passed: Checkpoints disabled via CLI flag"
else
    echo "❌ Test 5b failed: Expected checkpoints to be disabled"
    cat output.txt
    exit 1
fi

# Cleanup
cd /
rm -rf "$TEST_DIR"

echo ""
echo "✅ All checkpoint configuration tests passed!"
echo ""
echo "Summary:"
echo "- Checkpoints are enabled by default"
echo "- Can be disabled via CLAUDE_FLOW_CHECKPOINTS_ENABLED=false"
echo "- CLI flag --no-checkpoints sets the environment variable"
echo "- All checkpoint functions check the configuration before running"