import { Project, SyntaxKind } from "ts-morph";
import * as fs from "fs";

const translated = JSON.parse(fs.readFileSync("/workspace/app-bo4w33bsdqm9/translated-en.json", "utf-8")); // just for keys

const project = new Project();
project.addSourceFileAtPath("/workspace/app-bo4w33bsdqm9/src/i18n.ts");
const sourceFile = project.getSourceFileOrThrow("src/i18n.ts");

const resourcesDecl = sourceFile.getVariableDeclaration("resources");
const resourcesInit = resourcesDecl.getInitializerIfKindOrThrow(SyntaxKind.ObjectLiteralExpression);

const zhProp = resourcesInit.getPropertyOrThrow("'zh-CN'");
if (zhProp.getKind() === SyntaxKind.PropertyAssignment) {
  const zhObj = zhProp.getInitializerIfKindOrThrow(SyntaxKind.ObjectLiteralExpression);
  const translationProp = zhObj.getPropertyOrThrow("translation");
  
  if (translationProp.getKind() === SyntaxKind.PropertyAssignment) {
    const transObj = translationProp.getInitializerIfKindOrThrow(SyntaxKind.ObjectLiteralExpression);
    
    for (const key of Object.keys(translated)) {
      const propName = JSON.stringify(key);
      const existing = transObj.getProperty(p => p.getKind() === SyntaxKind.PropertyAssignment && (p.getName() === key || p.getName() === propName));
      if (!existing) {
        transObj.addPropertyAssignment({
          name: propName,
          initializer: JSON.stringify(key)
        });
      }
    }
  }
}

sourceFile.saveSync();
console.log("Injected ZH translations successfully.");
