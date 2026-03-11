@echo off
:: ============================================================
:: push_github.bat — Premier push vers playtosor/m_AI_l
:: À lancer une seule fois depuis C:\release\m_AI_l\
:: ============================================================

echo Initialisation du depot Git local...
git init

echo Ajout des fichiers...
git add .

echo Commit initial...
git commit -m "Initial release — m_AI_l v1"

echo Configuration du remote GitHub...
git remote add origin https://github.com/playtosor/m_AI_l.git

echo Push vers GitHub...
git branch -M main
git push -u origin main

echo.
echo Done. Verifier sur https://github.com/playtosor/m_AI_l
pause
