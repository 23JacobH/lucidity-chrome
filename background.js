chrome.action.onClicked.addListener(() => {
  chrome.windows.create({
    url: chrome.runtime.getURL("timer.html"),
    type: "popup",
    width: 400,
    height: 600
  });
});
