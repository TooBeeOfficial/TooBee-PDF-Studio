module.exports = async function(context) {
  console.log("⏳ Waiting 5 seconds to let Windows Defender finish scanning the executable before rcedit modifies it...");
  await new Promise(resolve => setTimeout(resolve, 5000));
  console.log("✅ Wait complete. Proceeding with rcedit.");
};
