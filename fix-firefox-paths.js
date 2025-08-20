import fs from "fs";
import path from "path";

const fixFirefoxPaths = () => {
  const firefoxDir = ".output/firefox-mv2";
  const files = ["options.html", "sidepanel.html"];

  files.forEach((file) => {
    const filePath = path.join(firefoxDir, file);
    if (fs.existsSync(filePath)) {
      let content = fs.readFileSync(filePath, "utf8");

      // Fix script and link paths to be relative to extension root
      content = content.replace(/src="[^"]*\/chunks\//g, 'src="chunks/');
      content = content.replace(/href="[^"]*\/chunks\//g, 'href="chunks/');
      content = content.replace(/href="[^"]*\/assets\//g, 'href="assets/');

      fs.writeFileSync(filePath, content);
      console.log(`Fixed paths in ${file}`);
    }
  });
};

fixFirefoxPaths();
