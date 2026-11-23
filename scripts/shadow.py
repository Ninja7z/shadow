#!/usr/bin/env python3
"""Portable self-hosted Shadow multi-provider gateway bootstrap."""
from __future__ import annotations
import argparse, os, secrets, shutil, subprocess, sys
from pathlib import Path
from typing import Any
ROOT=Path(__file__).resolve().parents[1]
ENV_FILE=ROOT/'.env'; LOCAL_CONFIG=ROOT/'config'/'shadow.yaml'
STARTER=ROOT/'config'/'shadow.example.yaml'; CATALOG=ROOT/'config'/'providers.catalog.yaml'
VENV=ROOT/'.venv'; WINDOWS=os.name=='nt'
def read_env():
 values={}
 if ENV_FILE.exists():
  for raw in ENV_FILE.read_text(encoding='utf-8').splitlines():
   line=raw.strip()
   if not line or line.startswith('#') or '=' not in line: continue
   k,v=line.split('=',1); values[k.strip()]=v.strip().strip('"').strip("'")
 return values
def write_env(values):
 text='# Private local credentials. Never commit this file.\n'+'# Add optional provider keys below.\n'+'\n'.join(f'{k}={v}' for k,v in values.items())+'\n'
 ENV_FILE.write_text(text,encoding='utf-8')
 try: ENV_FILE.chmod(0o600)
 except OSError: pass
def pybin(): return VENV/('Scripts/python.exe' if WINDOWS else 'bin/python')
def litellm_bin(): return VENV/('Scripts/litellm.exe' if WINDOWS else 'bin/litellm')
def ensure_venv():
 if not pybin().exists(): subprocess.run([sys.executable,'-m','venv',str(VENV)],check=True)
 subprocess.run([str(pybin()),'-m','pip','install','--upgrade','pip'],check=True)
 subprocess.run([str(pybin()),'-m','pip','install','-r',str(ROOT/'requirements.txt')],check=True)
def enabled_models(values):
 import yaml
 data=yaml.safe_load(CATALOG.read_text(encoding='utf-8')) or {}; result=[]
 for p in data.get('providers',[]):
  required=[p['api_key_env'],*p.get('required_env',[])]
  if not all(values.get(k) for k in required): continue
  params={'model':p['model'],'api_key':'os.environ/'+p['api_key_env'],'timeout':120}
  if p.get('api_base'):
   base=p['api_base']
   for k in p.get('required_env',[]): base=base.replace('${'+k+'}',values[k])
   params['api_base']=base
  if p.get('extra_headers'): params['extra_headers']=p['extra_headers']
  result.append({'model_name':p['model_name'],'litellm_params':params})
 for key_env, base_env, model_env, alias, prefix in [
  ('CUSTOM_OPENAI_API_KEY','CUSTOM_OPENAI_BASE_URL','CUSTOM_OPENAI_MODEL','shadow-custom-openai','openai/'),
  ('CUSTOM_ANTHROPIC_API_KEY','CUSTOM_ANTHROPIC_BASE_URL','CUSTOM_ANTHROPIC_MODEL','shadow-custom-anthropic','anthropic/'),
 ]:
  if values.get(key_env) and values.get(base_env) and values.get(model_env):
   result.append({'model_name':alias,'litellm_params':{
    'model':prefix+values[model_env],'api_base':values[base_env],
    'api_key':'os.environ/'+key_env,'timeout':120
   }})
 return result
def build_config(values):
 import yaml
 cfg=yaml.safe_load(STARTER.read_text(encoding='utf-8'))
 providers=enabled_models(values)
 cfg['model_list'].extend(providers)
 catalog=yaml.safe_load(CATALOG.read_text(encoding='utf-8')) or {}
 safe_ids={p['model_name'] for p in catalog.get('providers',[]) if p.get('auto_fallback',False)}
 automatic=[p for p in providers if p['model_name'] in safe_ids]
 if automatic:
  cfg['model_list'][1]={'model_name':'shadow-auto','litellm_params':dict(automatic[0]['litellm_params'])}
  cfg['router_settings']={'fallbacks':[{'shadow-auto':[p['model_name'] for p in automatic[1:]]+['shadow-local']}]}
 else:
  cfg['router_settings']={'fallbacks':[{'shadow-auto':['shadow-local']}]}
 return cfg
def setup(_):
 if not ENV_FILE.exists(): shutil.copyfile(ROOT/'.env.example',ENV_FILE)
 values=read_env()
 if not values.get('LITELLM_MASTER_KEY'):
  values['LITELLM_MASTER_KEY']='sk-shadow-'+secrets.token_urlsafe(36)
  write_env(values)
 ensure_venv()
 subprocess.run([str(pybin()),str(ROOT/'scripts'/'shadow.py'),'_finish_setup'],cwd=ROOT,check=True)
 return 0
def finish_setup(_):
 values=read_env()
 cfg=build_config(values)
 LOCAL_CONFIG.write_text(yaml.safe_dump(cfg,sort_keys=False,allow_unicode=True),encoding='utf-8')
 try: LOCAL_CONFIG.chmod(0o600)
 except OSError: pass
 print('Setup concluído. Config local criada e chave mestra gerada.')
 print(f"Provedores remotos ativados: {len(enabled_models(values))}; nenhum é obrigatório.")
 print('Para custo zero: instale Ollama, execute: ollama pull llama3.2:3b')
 print('Depois: python scripts/shadow.py start')
 return 0
def configure(_):
 values=read_env(); data=yaml.safe_load(CATALOG.read_text(encoding='utf-8')) or {}
 print('Provedores opcionais. Cadastre as variáveis no .env para ativá-los:')
 for p in data.get('providers',[]):
  required=[p['api_key_env'],*p.get('required_env',[])]; state='ATIVO' if all(values.get(k) for k in required) else 'opcional'
  auto='auto-fallback' if p.get('auto_fallback',False) else 'manual-only by default'
  print(f"[{state}] {p['label']} | {', '.join(required)} | {p['access']} | {auto} | {p['docs']}")
 return 0
def refresh(_):
 values=read_env()
 if not values.get('LITELLM_MASTER_KEY'): print('Execute setup primeiro.'); return 2
 cfg=build_config(values); LOCAL_CONFIG.write_text(yaml.safe_dump(cfg,sort_keys=False,allow_unicode=True),encoding='utf-8')
 try: LOCAL_CONFIG.chmod(0o600)
 except OSError: pass
 print(f"Config atualizada: {len(cfg['model_list'])} aliases; {len(enabled_models(values))} provedores remotos ativos.")
 return 0
def validate(_):
 if not LOCAL_CONFIG.exists(): print('Execute setup primeiro.'); return 2
 cfg=yaml.safe_load(LOCAL_CONFIG.read_text(encoding='utf-8')); names=[x['model_name'] for x in cfg.get('model_list',[])]
 if len(names)!=len(set(names)) or not {'shadow-local','shadow-auto'}.issubset(names): print('Config inválida.'); return 2
 print(f'OK: {len(names)} aliases; local e auto presentes.'); return 0
def start(args):
 if not LOCAL_CONFIG.exists(): print('Execute setup primeiro.'); return 2
 values=read_env()
 if not values.get('LITELLM_MASTER_KEY'): print('Chave local ausente. Execute setup.'); return 2
 env=os.environ.copy(); env.update(values)
 cmd=[str(litellm_bin()),'--config',str(LOCAL_CONFIG),'--host','127.0.0.1','--port',str(args.port)]
 print(f'Shadow API em http://127.0.0.1:{args.port}; Ctrl+C encerra.')
 return subprocess.call(cmd,cwd=ROOT,env=env)
def main():
 parser=argparse.ArgumentParser(description='Shadow self-hosted multi-provider API'); sub=parser.add_subparsers(dest='command',required=True)
 for name,fn in [('setup',setup),('configure',configure),('refresh',refresh),('validate',validate)]: sub.add_parser(name).set_defaults(func=fn)
 run=sub.add_parser('start'); run.add_argument('--port',type=int,default=4000); run.set_defaults(func=start)
 sub.add_parser('_finish_setup').set_defaults(func=finish_setup)
 args=parser.parse_args()
 # Bootstrap must work on a clean machine with only Python installed.
 # All YAML parsing and runtime commands are delegated to the isolated venv.
 if args.command != '_finish_setup' and pybin().exists():
  try:
   if Path(sys.prefix).resolve() != VENV.resolve():
    return subprocess.call([str(pybin()),str(ROOT/'scripts'/'shadow.py'),*sys.argv[1:]],cwd=ROOT)
  except OSError:
   pass
 if args.command != 'setup' and not pybin().exists() and args.command != '_finish_setup':
  print('Run setup first to install Shadow dependencies.')
  return 2
 if args.command != 'setup':
  import yaml
  globals()['yaml']=yaml
 try: return int(args.func(args))
 except subprocess.CalledProcessError as e: print(f'Comando falhou: exit {e.returncode}'); return int(e.returncode or 1)
if __name__=='__main__': raise SystemExit(main())
