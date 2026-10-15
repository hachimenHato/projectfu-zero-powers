"""Validate and package an FVTT module without third-party Python dependencies."""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
import subprocess
import zipfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
EXCLUDED_DIRECTORIES = {".git", ".github", "node_modules", "__pycache__", "tools", "tests", "dist", "secrets"}
EXCLUDED_ROOT_FILES = {
    "package.json", "package-lock.json", "RELEASING.md", "DEVELOPMENT_HANDOFF.md",
    "source-catalog.json", "translations.json", "quality-report.json", "hardcoded-quality-report.json",
}
SECRET = re.compile(r"github_pat_[A-Za-z0-9_]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|sk-[A-Za-z0-9]{24,}")


def unique_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError(f"Duplicate JSON key: {key}")
        result[key] = value
    return result


def read_json(file: Path):
    return json.loads(file.read_text(encoding="utf-8-sig"), object_pairs_hook=unique_object)


def included(file: Path) -> bool:
    relative = file.relative_to(ROOT)
    if any(part in EXCLUDED_DIRECTORIES for part in relative.parts[:-1]):
        return False
    if relative.name.startswith(".") or relative.suffix in {".pyc", ".pyo", ".zip"}:
        return False
    if len(relative.parts) == 1 and relative.name in EXCLUDED_ROOT_FILES:
        return False
    if relative.parts[0] == "packs" and relative.name in {"LOCK", "LOG", "LOG.old"}:
        return False
    return True


def local_file(relative: str) -> Path:
    file = (ROOT / relative).resolve()
    if not file.is_relative_to(ROOT):
        raise ValueError(f"Manifest path escapes repository: {relative}")
    if not file.exists():
        raise ValueError(f"Manifest file is missing: {relative}")
    return file


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--expect-repository")
    parser.add_argument("--expect-tag")
    args = parser.parse_args()
    manifest = read_json(ROOT / "module.json")
    module_id = manifest["id"]
    version = manifest["version"]
    if module_id == "projectfu-zh-cn":
        raise ValueError("This module is explicitly excluded from publication")
    if not re.fullmatch(r"[a-z0-9-]+", module_id):
        raise ValueError("Invalid FVTT module ID")
    if not re.fullmatch(r"[0-9]+(?:\.[0-9]+){2,3}", version):
        raise ValueError("Expected a numeric release version")
    match = re.fullmatch(r"https://github\.com/([A-Za-z0-9-]+)/([A-Za-z0-9._-]+)", manifest.get("url", ""))
    if not match or match[2] != module_id:
        raise ValueError("Project URL must match the module repository")
    repository = f"{match[1]}/{match[2]}"
    base = f"https://github.com/{repository}"
    if args.expect_repository and args.expect_repository.casefold() != repository.casefold():
        raise ValueError("Workflow repository does not match module.json; update publication URLs first")
    if args.expect_tag and args.expect_tag != f"v{version}":
        raise ValueError("Git tag and module version differ")
    if manifest.get("manifest") != f"{base}/releases/latest/download/module.json":
        raise ValueError("Manifest URL must remain stable between versions")
    if manifest.get("download") != f"{base}/releases/download/v{version}/{module_id}.zip":
        raise ValueError("Download URL must name this exact release and ZIP")
    external_modules = {
        entry["id"]
        for relation in ("requires", "recommends")
        for entry in manifest.get("relationships", {}).get(relation, [])
        if entry.get("type", "module") == "module"
    }

    runtime = []
    for key in ("scripts", "esmodules", "styles"):
        runtime.extend(local_file(value) for value in manifest.get(key, []))
    runtime.extend(local_file(language["path"]) for language in manifest.get("languages", []))
    for pack in manifest.get("packs", []):
        directory = local_file(pack["path"])
        current = directory / "CURRENT"
        if not current.is_file():
            raise ValueError(f"Compendium has no CURRENT file: {pack['name']}")
        if not (directory / current.read_text(encoding="ascii").strip()).is_file():
            raise ValueError(f"Compendium manifest is missing: {pack['name']}")

    files = sorted((file for file in ROOT.rglob("*") if file.is_file() and included(file)), key=lambda file: file.relative_to(ROOT).as_posix())
    included_paths = {file.resolve() for file in files}
    for file in runtime:
        if file.resolve() not in included_paths:
            raise ValueError(f"A required runtime file was excluded: {file.name}")
    node = shutil.which("node")
    if not node:
        raise RuntimeError("Node.js is required for JavaScript syntax validation")
    json_count = script_count = 0
    for file in files:
        relative = file.relative_to(ROOT).as_posix()
        if file.is_symlink():
            raise ValueError(f"Symbolic links are not allowed in release packages: {relative}")
        if file.suffix == ".json":
            read_json(file)
            json_count += 1
        if file.suffix in {".js", ".mjs", ".json", ".hbs", ".css", ".md"}:
            text = file.read_text(encoding="utf-8-sig")
            if SECRET.search(text):
                raise ValueError(f"Possible credential in {relative}; matching text was not printed")
        if file.suffix in {".js", ".mjs"}:
            text = file.read_text(encoding="utf-8-sig")
            check = subprocess.run([node, "--input-type=module", "--check"], input=text, text=True, capture_output=True, encoding="utf-8")
            if check.returncode:
                raise ValueError(f"JavaScript syntax error in {relative}: {check.stderr}")
            script_count += 1
            if file.parts[-2] != "tests" and file.name != "build-packs.mjs":
                for specifier in re.findall(r"(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s*)['\"]([^'\"]+)['\"]", text):
                    if not specifier.startswith("."):
                        continue
                    dependency = (file.parent / specifier).resolve()
                    if dependency.is_relative_to(ROOT):
                        if dependency not in included_paths:
                            raise ValueError(f"Missing imported file in release: {relative} -> {specifier}")
                    elif (
                        "/systems/projectfu/" not in dependency.as_posix()
                        and not any(f"/{external_id}/" in dependency.as_posix() for external_id in external_modules)
                    ):
                        raise ValueError(f"Unexpected external relative import: {relative} -> {specifier}")
    if module_id == "glitchsmith-zh-cn":
        for filename in ("hardcoded-catalog.json", "hardcoded-translations.json"):
            if (ROOT / filename).resolve() not in included_paths:
                raise ValueError(f"Runtime translation data missing: {filename}")

    output = ROOT / "dist"
    output.mkdir(exist_ok=True)
    archive = output / f"{module_id}.zip"
    with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as package:
        for file in files:
            info = zipfile.ZipInfo(file.relative_to(ROOT).as_posix(), date_time=(2026, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            package.writestr(info, file.read_bytes())
    manifest_bytes = (ROOT / "module.json").read_bytes()
    (output / "module.json").write_bytes(manifest_bytes)
    with zipfile.ZipFile(archive) as package:
        if package.testzip() is not None:
            raise ValueError("ZIP integrity validation failed")
        if package.read("module.json") != manifest_bytes:
            raise ValueError("Published and packaged manifests differ")
        if len(package.namelist()) != len(files):
            raise ValueError("ZIP file count mismatch")
    sums = []
    for file in (output / "module.json", archive):
        sums.append(f"{hashlib.sha256(file.read_bytes()).hexdigest()}  {file.name}")
    (output / "SHA256SUMS.txt").write_text("\n".join(sums) + "\n", encoding="utf-8")
    print(f"{module_id} v{version}: files={len(files)} JSON={json_count} scripts={script_count}; ZIP and manifest validated")


if __name__ == "__main__":
    main()
